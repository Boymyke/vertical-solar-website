// Lazy video embeds (YouTube / Vimeo / MP4) — nothing loads until the visitor presses play.
import { esc } from './core.js';
import { trackEvent } from './track.js';

export function mountVideo(el, url, poster, caption) {
  if (!url) return;
  const yt = url.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/);
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  const thumb = poster || (yt ? `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` : '');
  el.classList.add('video-embed');
  if (thumb) el.style.backgroundImage = `url("${thumb}")`;
  el.innerHTML = `<button type="button" aria-label="Play video${caption ? ': ' + esc(caption) : ''}"><span class="play"><i class="ri-play-fill" aria-hidden="true"></i></span>${caption ? `<span class="video-caption">${esc(caption)}</span>` : ''}</button>`;
  el.querySelector('button').addEventListener('click', () => {
    if (yt) el.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&rel=0" title="${esc(caption || 'Video')}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    else if (vimeo) el.innerHTML = `<iframe src="https://player.vimeo.com/video/${vimeo[1]}?autoplay=1" title="${esc(caption || 'Video')}" allow="autoplay; fullscreen" allowfullscreen></iframe>`;
    else el.innerHTML = `<video src="${esc(url)}" controls autoplay playsinline ${poster ? `poster="${esc(poster)}"` : ''}></video>`;
    trackEvent('video_play', { url });
  });
}

