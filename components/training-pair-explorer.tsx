'use client';

import { useEffect, useState } from 'react';
import NextImage from 'next/image';
import { ArrowRight, LockKeyhole } from 'lucide-react';

const SIDE = 6;
const CHANNELS = ['Червено', 'Зелено', 'Синьо'];
// Illustrative embeddings only: this component does not run a text encoder.
const TEXT_ROWS = [
  [0.12, -0.31, 0.54, 0.08],
  [0.67, 0.23, -0.15, 0.42],
  [0.42, -0.18, 0.77, 0.31],
  [-0.24, 0.62, 0.11, -0.48],
  [0.29, 0.16, -0.52, 0.73],
  [-0.06, 0.91, 0.24, -0.35],
];
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

export function TrainingPairExplorer({ caption, showTechnical }: { caption: string; showTechnical: boolean }) {
  const [pixels, setPixels] = useState<number[][]>([]);
  const [imageError, setImageError] = useState(false);
  const [cell, setCell] = useState(9);
  const [channel, setChannel] = useState(0);
  const [word, setWord] = useState(2);
  const words = caption.split(' ');

  useEffect(() => {
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SIDE;
        canvas.height = SIDE;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas unavailable');
        // Read real RGB values from a resized preview, not from a latent encoder.
        context.drawImage(image, 0, 0, SIDE, SIDE);
        const { data } = context.getImageData(0, 0, SIDE, SIDE);
        setPixels(Array.from({ length: SIDE * SIDE }, (_, index) => Array.from(data.slice(index * 4, index * 4 + 3))));
      } catch {
        setImageError(true);
      }
    };
    image.onerror = () => { if (active) setImageError(true); };
    image.src = '/fox-moon.webp';
    return () => { active = false; };
  }, []);

  const selectedPixel = pixels[cell];
  const position = `ред ${Math.floor(cell / SIDE) + 1}, колона ${cell % SIDE + 1}`;

  return (
    <section aria-labelledby="pair-numbers-heading" className="border-t border-white/8 bg-[#0d0e20]/70 p-4 sm:p-6">
      <div className="mb-6 max-w-2xl">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#72d7af]">Приближаваме двойка № 001</p>
        <h4 id="pair-numbers-heading" className="mt-2 text-xl font-semibold">Една двойка. Два вида числа.</h4>
        <p className="mt-2 text-sm leading-6 text-white/60">Картинката и описанието остават свързани като един пример. За изчисленията всяка част получава свое числово представяне.</p>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <article className="min-w-0 rounded-2xl border border-[#72d7af]/20 bg-[#72d7af]/[0.035] p-4 sm:p-5">
          <p className="text-sm font-semibold text-[#9ee3c8]">Картинката → числа за цвета</p>
          <p className="mt-2 text-xs leading-5 text-white/60">Избери квадратче или число. Осветяваме едно и също място в двата изгледа.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs text-white/60">Цялата картинка с решетка</p>
              <div className="relative aspect-square overflow-hidden rounded-xl">
                <NextImage src="/fox-moon.webp" alt="Лисица под луната — избери област от решетката" fill unoptimized sizes="(min-width: 640px) 240px, 100vw" />
                <fieldset className="absolute inset-0 m-0 grid min-w-0 grid-cols-6 border-0 p-0" aria-label="Области от картинката">
                  {Array.from({ length: SIDE * SIDE }, (_, index) => (
                    <button key={index} type="button" aria-label={`Област: ред ${Math.floor(index / SIDE) + 1}, колона ${index % SIDE + 1}`} aria-pressed={cell === index} onClick={() => setCell(index)} className={`relative border border-white/20 ${FOCUS} ${cell === index ? 'z-10 bg-[#72d7af]/30 ring-2 ring-inset ring-[#9ee3c8]' : 'hover:bg-white/15'}`} />
                  ))}
                </fieldset>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs text-white/60">Таблица 6 × 6 · {CHANNELS[channel].toLowerCase()}</p>
              <fieldset className="m-0 grid aspect-square min-w-0 grid-cols-6 gap-1 border-0 p-0" aria-label="Числова матрица на изображението">
                {Array.from({ length: SIDE * SIDE }, (_, index) => (
                  <button key={index} type="button" disabled={!pixels.length} aria-label={`Стойност: ред ${Math.floor(index / SIDE) + 1}, колона ${index % SIDE + 1}, ${CHANNELS[channel]} ${pixels[index]?.[channel] ?? 'зареждане'}`} aria-pressed={cell === index} onClick={() => setCell(index)} className={`min-w-0 rounded font-mono text-[11px] ${FOCUS} ${cell === index ? 'bg-[#9ee3c8] font-bold text-[#10251d] ring-2 ring-[#9ee3c8]' : 'bg-white/5 text-white/75 hover:bg-white/15'}`}>
                    {pixels[index]?.[channel] ?? '–'}
                  </button>
                ))}
              </fieldset>
            </div>
          </div>
          <fieldset className="mt-4 flex min-w-0 flex-wrap gap-2 border-0 p-0" aria-label="Цветова таблица">
            {CHANNELS.map((name, index) => (
              <button key={name} type="button" onClick={() => setChannel(index)} aria-pressed={channel === index} className={`rounded-full border px-3 py-2 text-xs ${FOCUS} ${channel === index ? 'border-[#72d7af]/50 bg-[#72d7af]/15 text-[#9ee3c8]' : 'border-white/15 text-white/65 hover:bg-white/10'}`}>{name}</button>
            ))}
          </fieldset>
          <div className="mt-4 rounded-xl bg-black/20 p-3" aria-live="polite" aria-atomic="true">
            <p className="text-xs text-white/60">Избраното място · {position}</p>
            {selectedPixel ? (
              <div className="mt-2 flex items-center gap-3">
                <span className="size-8 shrink-0 rounded-lg border border-white/20" style={{ backgroundColor: `rgb(${selectedPixel.join(',')})` }} aria-hidden="true" />
                <p className="font-mono text-sm text-[#9ee3c8]">[{selectedPixel.join(', ')}]</p>
                <span className="text-[11px] text-white/60">червено, зелено, синьо</span>
              </div>
            ) : <p className="mt-2 text-xs text-white/65" role={imageError ? 'alert' : undefined}>{imageError ? 'Не успяхме да прочетем цветовете. Презареди страницата.' : 'Прочитаме цветовете…'}</p>}
          </div>
          <p className="mt-3 text-xs leading-5 text-white/60">Един цвят е ред от 3 числа — <strong className="text-white/85">вектор</strong>. Една цветова таблица е <strong className="text-white/85">матрица</strong>. Тук четем реалните цветове от смален преглед 6 × 6, не от скритата скица на AI.</p>
        </article>

        <article className="min-w-0 rounded-2xl border border-[#f3a177]/20 bg-[#f3a177]/[0.035] p-4 sm:p-5">
          <p className="text-sm font-semibold text-[#f3a177]">Описанието → числови подсказки</p>
          <p className="mt-2 text-xs leading-5 text-white/60">Текстов модел разглежда изречението и изчислява редове от числа за неговите части.</p>
          <fieldset className="mt-4 flex min-w-0 flex-wrap gap-2 border-0 p-0" aria-label="Думи от описанието">
            {words.map((token, index) => (
              <button key={`${token}-${index}`} type="button" aria-pressed={word === index} onClick={() => setWord(index)} className={`rounded-lg border px-3 py-2 text-sm ${FOCUS} ${word === index ? 'border-[#f3a177] bg-[#f3a177] text-[#251710]' : 'border-white/15 text-white/75 hover:bg-white/10'}`}>{token}</button>
            ))}
          </fieldset>
          <p className="mb-2 mt-5 text-xs font-medium text-[#f3a177]">Учебни числа · не са изчислени от истински текстов модел</p>
          <table className="w-full table-fixed border-separate border-spacing-y-1 text-left text-xs" aria-label="Примерна матрица на описанието">
            <caption className="sr-only">Всеки ред показва четири измислени стойности за една дума. Реалният модел използва части от думи и много повече стойности.</caption>
            <thead><tr className="text-[10px] text-white/60"><th className="w-[28%] py-2 font-normal">част</th>{[1, 2, 3, 4].map(index => <th key={index} className="text-center font-normal">число {index}</th>)}</tr></thead>
            <tbody>
              {words.map((token, index) => (
                <tr key={`${token}-row`} className={word === index ? 'bg-[#f3a177]/20 text-[#ffd4bc]' : 'bg-white/[0.035] text-white/65'}>
                  <th scope="row" className="rounded-l-lg font-normal"><button type="button" onClick={() => setWord(index)} aria-label={`Вектор за ${token}`} aria-pressed={word === index} className={`w-full rounded-l-lg px-2 py-3 text-left ${FOCUS}`}>{token}</button></th>
                  {TEXT_ROWS[index].map((value, column) => <td key={column} className="py-3 text-center font-mono last:rounded-r-lg">{value.toFixed(2)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs leading-5 text-white/65" aria-live="polite">Осветеният ред за „{words[word]}“ е <strong className="text-white/85">вектор</strong>. Събраните редове образуват <strong className="text-white/85">матрица</strong>.</p>
          <p className="mt-2 text-xs leading-5 text-white/60">Числата зависят и от останалото изречение. Няма едно число за „лисица“, нито отделна стойност, която означава „опашка“.</p>
        </article>
      </div>

      <div className="mt-5 grid items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-4 sm:grid-cols-[1fr_auto_1fr]">
        <div><p className="text-sm font-semibold text-[#9ee3c8]">Това са входовете на един пример</p><p className="mt-2 text-xs leading-5 text-white/65">Към изображението добавяме шум. Описанието насочва отговора. Двата набора от числа се използват заедно — не се събират в една обща таблица.</p></div>
        <ArrowRight className="hidden size-5 text-white/35 sm:block" aria-hidden="true" />
        <div><p className="flex items-center gap-2 text-sm font-semibold text-[#f3a177]"><LockKeyhole className="size-4 shrink-0" aria-hidden="true" />Тежестите са друго</p><p className="mt-2 text-xs leading-5 text-white/65">При обучението грешката коригира научените тежести. При генерирането зареждаме тези тежести и подаваме нов текст и случаен шум, не тренировъчната картинка.</p></div>
      </div>

      <details className="mt-4 text-xs leading-5 text-white/65">
        <summary className={`cursor-pointer rounded py-2 font-medium text-white/80 ${FOCUS}`}>А как се записва самата двойка?</summary>
        <p className="mt-2">Например като файл с изображение и свързан с него текстов запис. Числовите представяния могат да се изчисляват при зареждане или да се запазят предварително. Двойката не става един ред в тежестите на модела.</p>
        <dl className="mt-3 grid gap-2 rounded-xl bg-black/20 p-3 sm:grid-cols-[auto_1fr]">
          <dt className="text-white/45">Пример</dt><dd>001</dd>
          <dt className="text-white/45">Файл</dt><dd className="font-mono">fox-moon.webp</dd>
          <dt className="text-white/45">Описание</dt><dd>„{caption}“</dd>
        </dl>
      </details>
      {showTechnical && (
        <div className="mt-4 space-y-2 rounded-xl border border-[#afa3d9]/20 p-4 text-xs leading-5 text-[#c9bdf1]">
          <p>RGB: H × W × 3 е тримерен тензор (тук 6 × 6 × 3). Избираме един канал, за да видим матрица H × W. Това е смаляване на пикселите, не VAE кодиране.</p>
          <p>Текст: токенизация → text encoder → матрица L × d. В действителност токените може да са части от думи; тук показваме 6 думи × 4 условни стойности само за четимост.</p>
          <p>При latent diffusion изображението допълнително се кодира в по-малък тензор. Оригиналният Imagen (2022) работи с дифузия върху пиксели — не всички модели използват латенти.</p>
          <a href="https://arxiv.org/html/2205.11487v1#S2" target="_blank" rel="noreferrer" className={`inline-block underline underline-offset-4 ${FOCUS}`}>Imagen: числовите входове и архитектурата</a>
        </div>
      )}
    </section>
  );
}
