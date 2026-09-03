'use client';

/* oxlint-disable jsx-a11y/prefer-tag-over-role -- These canvas elements draw pixel data directly; role="img" provides their accessible image semantics. */

import { useEffect, useRef, useState } from 'react';
import { Equal, Plus } from 'lucide-react';

const SIZE = 128;

export function WhatIsNoise() {
  const original = useRef<HTMLCanvasElement>(null);
  const noise = useRef<HTMLCanvasElement>(null);
  const combined = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const source = new Image();
    source.onload = () => {
      const originalContext = original.current?.getContext('2d');
      const noiseContext = noise.current?.getContext('2d');
      const combinedContext = combined.current?.getContext('2d');
      if (!originalContext || !noiseContext || !combinedContext) return;

      originalContext.drawImage(source, 0, 0, SIZE, SIZE);
      const pixels = originalContext.getImageData(0, 0, SIZE, SIZE);
      const noisePixels = noiseContext.createImageData(SIZE, SIZE);
      const noisyPixels = combinedContext.createImageData(SIZE, SIZE);
      // Fixed seed keeps the example stable. Box–Muller gives signed Gaussian noise.
      let seed = 8723;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return (seed + 1) / 4294967297;
      };
      for (let index = 0; index < pixels.data.length; index += 4) {
        for (let channel = 0; channel < 3; channel += 1) {
          const offset = Math.sqrt(-2 * Math.log(random())) * Math.cos(2 * Math.PI * random()) * 65;
          // The middle picture visualizes signed offsets around grey (128).
          // The right picture actually adds those offsets, rather than crossfading.
          noisePixels.data[index + channel] = 128 + offset;
          noisyPixels.data[index + channel] = pixels.data[index + channel] + offset;
        }
        noisePixels.data[index + 3] = 255;
        noisyPixels.data[index + 3] = 255;
      }
      noiseContext.putImageData(noisePixels, 0, 0);
      combinedContext.putImageData(noisyPixels, 0, 0);
      setStatus('ready');
    };
    source.onerror = () => setStatus('error');
    source.src = '/fox-moon.webp';
    return () => { source.onload = null; source.onerror = null; };
  }, []);

  return (
    <div className="lg:col-span-2" aria-labelledby="what-is-noise-title">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8ed3ba]">Преди „защо“ — какво е това?</p>
      <h2 id="what-is-noise-title" className="mt-4 text-3xl font-medium tracking-tight sm:text-4xl">Шумът е случайни числа, които можем да видим.</h2>
      <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground">
        Тук не говорим за звук. Компютърът избира случайни стойности за различните места.
        Показани като цветове, те изглеждат като разпръснати зрънца — без нарисувана лисица или луна.
      </p>

      <div className="mt-7 rounded-[24px] border border-white/10 bg-[#131426] p-4 sm:p-6">
        <div className="mx-auto grid max-w-3xl grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 sm:gap-5">
          <figure className="min-w-0">
            <canvas ref={original} width={SIZE} height={SIZE} role="img" aria-label="Оригинална картинка: лисица под луната" className="aspect-square w-full rounded-xl bg-white/5">Лисица под луната, без добавен шум.</canvas>
            <figcaption className="mt-3 h-10 text-center text-xs font-semibold sm:h-auto sm:text-sm">Картинка</figcaption>
          </figure>
          <Plus className="mb-7 size-4 text-[#f3a177] sm:size-5" aria-hidden="true" />
          <figure className="min-w-0">
            <canvas ref={noise} width={SIZE} height={SIZE} role="img" aria-label="Само шум: случайни цветни зрънца без подредена сцена" className="aspect-square w-full rounded-xl bg-white/5">Случайни числови стойности, показани като цветни зрънца.</canvas>
            <figcaption className="mt-3 h-10 text-center text-xs font-semibold text-[#f3a177] sm:h-auto sm:text-sm">Само шум</figcaption>
          </figure>
          <Equal className="mb-7 size-4 text-[#f3a177] sm:size-5" aria-hidden="true" />
          <figure className="min-w-0">
            <canvas ref={combined} width={SIZE} height={SIZE} role="img" aria-label="Картинката след добавяне на шум: лисицата и луната се виждат сред зрънцата" className="aspect-square w-full rounded-xl bg-white/5">Същата лисица, с добавени случайни промени в цветовете.</canvas>
            <figcaption className="mt-3 h-10 text-center text-xs font-semibold sm:h-auto sm:text-sm">С добавен шум</figcaption>
          </figure>
        </div>
        {status !== 'ready' && <output className="mt-4 block text-center text-sm text-white/60">{status === 'error' ? 'Картинките не се заредиха. Презареди страницата, за да видиш примера.' : 'Зареждаме визуалния пример…'}</output>}
        <p className="mx-auto mt-6 max-w-3xl text-sm leading-6 text-white/65">
          „Добавяме шум“ означава: случайно увеличаваме или намаляваме стойностите на цветовете.
          Някои точки стават по-светли, други по-тъмни или с друг цвят. Не размазваме картинката — нарушаваме подредбата ѝ.
        </p>
        <details className="mx-auto mt-4 max-w-3xl border-t border-white/8 pt-4 text-sm text-white/55">
          <summary className="cursor-pointer font-semibold text-white/75">А какво става с числата?</summary>
          <p className="mt-3 leading-6">Например една цветова стойност е 120. Добавяме случайна промяна −35 и получаваме 85. Това се случва на много места, с различни промени.</p>
          <p className="mt-2 leading-6">Тук променяме направо цветовете, за да видиш идеята. В упражнението с решетките шумът се добавя към числата на скритата скица. Средната картинка показва тези положителни и отрицателни промени като цветове около сивото; стойностите за екрана са ограничени между 0 и 255.</p>
        </details>
      </div>
    </div>
  );
}
