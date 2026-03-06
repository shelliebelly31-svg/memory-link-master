import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { video_id } = await req.json();

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get the video
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select('*')
      .eq('id', video_id)
      .eq('user_id', user.id)
      .single();

    if (videoError || !video) {
      return new Response(JSON.stringify({ error: 'Video not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const youtubeId = video.youtube_id;
    if (!youtubeId || youtubeId.startsWith('manual-')) {
      return new Response(JSON.stringify({ error: 'Timestamp correction is only available for YouTube videos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    if (!ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ error: 'Audio transcription service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Step 1: Download audio
    console.log('Downloading audio for', youtubeId);
    let audioBuffer: ArrayBuffer | null = null;

    // Try Cobalt first
    try {
      const cobaltResponse = await fetch('https://api.cobalt.tools/', {
        method: 'POST',
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${youtubeId}`,
          downloadMode: 'audio',
          audioFormat: 'mp3',
          audioBitrate: '64',
        }),
      });
      if (cobaltResponse.ok) {
        const cobaltData = await cobaltResponse.json();
        if (cobaltData.url && (cobaltData.status === 'tunnel' || cobaltData.status === 'redirect')) {
          const audioResponse = await fetch(cobaltData.url);
          if (audioResponse.ok) {
            audioBuffer = await audioResponse.arrayBuffer();
            console.log('Audio downloaded via Cobalt');
          }
        }
      }
    } catch (e) {
      console.error('Cobalt failed:', e);
    }

    // Try Innertube clients
    if (!audioBuffer) {
      const clients = [
        { clientName: 'IOS', clientVersion: '19.09.3', apiKey: 'AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc', userAgent: 'com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)', extraContext: { deviceMake: 'Apple', deviceModel: 'iPhone14,3', osName: 'iPhone', osVersion: '15.6.0.19G71' } },
        { clientName: 'ANDROID_MUSIC', clientVersion: '6.42.52', apiKey: 'AIzaSyAOghZGza2MQSZkY_zfZ370N-PUdXEo8AI', userAgent: 'com.google.android.apps.youtube.music/6.42.52 (Linux; U; Android 11) gzip', extraContext: { androidSdkVersion: 30, platform: 'MOBILE' } },
      ];

      for (const client of clients) {
        try {
          const url = client.apiKey 
            ? `https://www.youtube.com/youtubei/v1/player?prettyPrint=false&key=${client.apiKey}`
            : 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
          
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': client.userAgent },
            body: JSON.stringify({
              context: { client: { hl: 'en', gl: 'US', clientName: client.clientName, clientVersion: client.clientVersion, ...client.extraContext } },
              videoId: youtubeId,
            }),
          });

          if (!response.ok) continue;
          const data = await response.json();
          const audioFormats = (data?.streamingData?.adaptiveFormats || [])
            .filter((f: any) => typeof f?.mimeType === 'string' && f.mimeType.includes('audio/') && typeof f?.url === 'string')
            .sort((a: any, b: any) => (Number(a.contentLength || 0)) - (Number(b.contentLength || 0)));

          if (audioFormats.length === 0) continue;
          
          const selected = audioFormats.find((f: any) => !f.contentLength || f.contentLength <= 25 * 1024 * 1024) || audioFormats[0];
          const audioResponse = await fetch(selected.url, { headers: { 'User-Agent': client.userAgent } });
          if (audioResponse.ok) {
            audioBuffer = await audioResponse.arrayBuffer();
            console.log(`Audio downloaded via Innertube ${client.clientName}`);
            break;
          }
        } catch (e) {
          console.error(`Innertube ${client.clientName} failed:`, e);
        }
      }
    }

    // Try Invidious
    if (!audioBuffer) {
      const instances = ['https://inv.nadeko.net', 'https://yt.artemislena.eu', 'https://invidious.nerdvpn.de'];
      for (const instance of instances) {
        try {
          const response = await fetch(`${instance}/latest_version?id=${youtubeId}&itag=140`, {
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          });
          if (response.ok) {
            const contentType = response.headers.get('content-type') || '';
            if (!contentType.includes('text/html') && !contentType.includes('application/json')) {
              audioBuffer = await response.arrayBuffer();
              console.log('Audio downloaded via Invidious');
              break;
            }
          }
        } catch (e) { /* continue */ }
      }
    }

    if (!audioBuffer) {
      return new Response(JSON.stringify({ error: 'Could not download audio for this video. YouTube may be blocking access.' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (audioBuffer.byteLength > 25 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'Audio file is too large (>25MB) for transcription' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Step 2: Transcribe with ElevenLabs
    console.log(`Sending ${(audioBuffer.byteLength / (1024 * 1024)).toFixed(1)}MB audio to ElevenLabs...`);
    
    const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.mp3');
    formData.append('model_id', 'scribe_v2');
    formData.append('tag_audio_events', 'false');
    formData.append('diarize', 'false');
    formData.append('timestamps_granularity', 'word');

    const sttResponse = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
      body: formData,
    });

    if (!sttResponse.ok) {
      const errText = await sttResponse.text();
      console.error('ElevenLabs error:', sttResponse.status, errText);
      return new Response(JSON.stringify({ error: 'Audio transcription failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const sttData = await sttResponse.json();
    const words = sttData.words || [];

    if (!words.length) {
      return new Response(JSON.stringify({ error: 'No words detected in audio' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`ElevenLabs returned ${words.length} words`);

    // Step 3: Build ~15-second segments
    const segments: Array<{start: number, end: number, text: string}> = [];
    let currentSegment: { start: number; end: number; words: string[] } | null = null;

    for (const word of words) {
      const wordStart = word.start || 0;
      const wordEnd = word.end || wordStart + 0.5;
      const wordText = (word.text || '').trim();
      if (!wordText) continue;

      if (!currentSegment) {
        currentSegment = { start: wordStart, end: wordEnd, words: [wordText] };
      } else if (wordEnd - currentSegment.start >= 15) {
        segments.push({
          start: Math.round(currentSegment.start * 10) / 10,
          end: Math.round(currentSegment.end * 10) / 10,
          text: currentSegment.words.join(' ').trim(),
        });
        currentSegment = { start: wordStart, end: wordEnd, words: [wordText] };
      } else {
        currentSegment.end = wordEnd;
        currentSegment.words.push(wordText);
      }
    }

    if (currentSegment && currentSegment.words.length > 0) {
      segments.push({
        start: Math.round(currentSegment.start * 10) / 10,
        end: Math.round(currentSegment.end * 10) / 10,
        text: currentSegment.words.join(' ').trim(),
      });
    }

    if (segments.length === 0) {
      return new Response(JSON.stringify({ error: 'Could not build segments from transcription' }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Step 4: Replace transcript segments
    await supabase.from('transcript_segments').delete().eq('video_id', video_id);

    const segmentRows = segments.map(seg => ({
      video_id,
      start_seconds: seg.start,
      end_seconds: seg.end,
      text: seg.text,
    }));

    const { error: insertError } = await supabase.from('transcript_segments').insert(segmentRows);
    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to save corrected segments' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Update duration
    const duration = Math.ceil(segments[segments.length - 1]?.end || 0);
    await supabase.from('videos').update({ duration_seconds: duration }).eq('id', video_id);

    console.log(`Timestamp correction complete: ${segments.length} segments`);

    return new Response(JSON.stringify({ 
      success: true, 
      segment_count: segments.length,
      duration_seconds: duration,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: unknown) {
    console.error('Error in fix-timestamps:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
