'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  BrainCircuit,
  ChevronRight,
  CircleDot,
  ImageIcon,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Waves,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

const TOTAL_STEPS = 20;
const SAMPLE_SIZE = 96;

type Mode = 'generate' | 'train';

const generationPhases = [
  {
    until: 0,
    title: 'Случаен шум',
    detail: 'Още няма обекти — само числа, определени от seed-а.',
  },
  {
    until: 4,
    title: 'Първа посока',
    detail: 'Текстът насочва кои малки промени са по-вероятни.',
  },
  {
    until: 9,
    title: 'Големи форми',
    detail: 'Композицията се появява преди фините подробности.',
  },
  {
    until: 15,
    title: 'Цвят и ръбове',
    detail: 'Силуетите и отношенията между обектите се стабилизират.',
  },
  {
    until: 19,
    title: 'Фини корекции',
    detail: 'Остават текстура, светлина и локални детайли.',
  },
  {
    until: 20,
    title: 'Декодиран образ',
    detail: 'Latent представянето е превърнато обратно във видима картинка.',
  },
];

const trainingPhases = [
  {
    until: 0,
    title: 'Истинска картинка',
    detail: 'Започваме с пример, от който моделът може да учи.',
  },
  {
    until: 6,
    title: 'Добавяме малко шум',
    detail: 'Част от детайлите се повреждат, но структурата още се вижда.',
  },
  {
    until: 13,
    title: 'Труден учебен пример',
    detail: 'Моделът трябва да отгатне точно какъв шум е бил добавен.',
  },
  {
    until: 19,
    title: 'Почти чист шум',
    detail: 'Остават само слаби следи от първоначалната структура.',
  },
  {
    until: 20,
    title: 'Gaussian noise',
    detail: 'Простата крайна форма, от която после можем да започнем генерация.',
  },
];

function hashNoise(value: number) {
  let x = value | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
}

function DiffusionCanvas({ mode, step, seed }: { mode: Mode; step: number; seed: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const signalProgress =
      mode === 'generate' ? step / TOTAL_STEPS : 1 - step / TOTAL_STEPS;
    const easedSignal = signalProgress * signalProgress * (3 - 2 * signalProgress);
    const noiseAmount = 1 - easedSignal;

    if (noiseAmount < 0.015) {
      context.imageSmoothingEnabled = true;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return;
    }

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = SAMPLE_SIZE;
    sourceCanvas.height = SAMPLE_SIZE;
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sourceContext) return;

    sourceContext.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const source = sourceContext.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    const output = sourceContext.createImageData(SAMPLE_SIZE, SAMPLE_SIZE);
    const stepDrift = mode === 'generate' ? step * 97 : step * 41;

    for (let pixel = 0; pixel < SAMPLE_SIZE * SAMPLE_SIZE; pixel += 1) {
      const offset = pixel * 4;
      const base = seed * 1009 + pixel * 313 + stepDrift;
      const noiseR = hashNoise(base + 17) * 255;
      const noiseG = hashNoise(base + 43) * 255;
      const noiseB = hashNoise(base + 89) * 255;

      output.data[offset] = source.data[offset] * easedSignal + noiseR * noiseAmount;
      output.data[offset + 1] =
        source.data[offset + 1] * easedSignal + noiseG * noiseAmount;
      output.data[offset + 2] =
        source.data[offset + 2] * easedSignal + noiseB * noiseAmount;
      output.data[offset + 3] = 255;
    }

    sourceContext.putImageData(output, 0, 0);
    context.imageSmoothingEnabled = step > 15 && mode === 'generate';
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(sourceCanvas, 0, 0, canvas.width, canvas.height);
  }, [mode, seed, step]);

  useEffect(() => {
    const image = new Image();
    image.src = '/fox-moon.webp';
    image.onload = () => {
      imageRef.current = image;
      setReady(true);
    };
  }, []);

  useEffect(() => {
    if (ready) draw();
  }, [draw, ready]);

  const noisePercent = Math.round(
    (mode === 'generate' ? 1 - step / TOTAL_STEPS : step / TOTAL_STEPS) * 100,
  );

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-[28px] bg-[#11122a] shadow-[0_30px_90px_rgba(1,2,12,0.42)] ring-1 ring-white/10">
      <canvas
        ref={canvasRef}
        width={720}
        height={720}
        role="img"
        aria-label={`${mode === 'generate' ? 'Генериране' : 'Обучение'}, стъпка ${step} от ${TOTAL_STEPS}, ${noisePercent}% шум`}
        className="h-full w-full"
      />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center text-sm text-white/60">
          Подготвяме изображението…
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-4 top-4 flex items-center justify-between gap-3">
        <span className="rounded-full bg-[#090a1a]/70 px-3 py-1.5 text-xs font-medium text-white/80 backdrop-blur-md">
          {mode === 'generate' ? 'Denoising' : 'Forward diffusion'}
        </span>
        <span className="rounded-full bg-[#090a1a]/70 px-3 py-1.5 font-mono text-xs text-white/70 backdrop-blur-md">
          {noisePercent}% noise
        </span>
      </div>
      <div className="pointer-events-none absolute inset-x-4 bottom-4 flex justify-end">
        <span className="rounded-full bg-[#090a1a]/70 px-3 py-1.5 font-mono text-xs text-white/70 backdrop-blur-md">
          seed {seed}
        </span>
      </div>
    </div>
  );
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div
      className="inline-flex rounded-full border border-white/10 bg-white/[0.045] p-1"
      aria-label="Посока на процеса"
    >
      <button
        type="button"
        onClick={() => onChange('generate')}
        aria-pressed={mode === 'generate'}
        className="rounded-full px-4 py-2 text-sm font-medium text-white/55 transition hover:text-white aria-pressed:bg-white aria-pressed:text-[#11122a]"
      >
        Генериране
      </button>
      <button
        type="button"
        onClick={() => onChange('train')}
        aria-pressed={mode === 'train'}
        className="rounded-full px-4 py-2 text-sm font-medium text-white/55 transition hover:text-white aria-pressed:bg-white aria-pressed:text-[#11122a]"
      >
        Обучение
      </button>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>('generate');
  const [step, setStep] = useState(0);
  const [seed, setSeed] = useState(2417);
  const [playing, setPlaying] = useState(false);

  const phases = mode === 'generate' ? generationPhases : trainingPhases;
  const phase = phases.find((item) => step <= item.until) ?? phases.at(-1)!;

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setStep((current) => {
        if (current >= TOTAL_STEPS) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 430);
    return () => window.clearInterval(timer);
  }, [playing]);

  const stepDirection = useMemo(
    () => (mode === 'generate' ? ['шум', 'образ'] : ['образ', 'шум']),
    [mode],
  );

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setPlaying(false);
    setStep(0);
  }

  function chooseNewSeed() {
    setSeed(1000 + Math.floor(Math.random() * 9000));
    setStep(0);
    setPlaying(false);
  }

  function togglePlayback() {
    if (step >= TOTAL_STEPS) setStep(0);
    setPlaying((current) => !current);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <header className="relative z-20 mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12">
        <a href="#top" className="flex items-center gap-2.5 text-sm font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-full bg-[#f08b5d] text-[#181026]">
            <CircleDot className="size-4" aria-hidden="true" />
          </span>
          Как работи AI
        </a>
        <nav className="hidden items-center gap-7 text-sm text-muted-foreground sm:flex" aria-label="Основна навигация">
          <a className="transition hover:text-foreground" href="#process">Процесът</a>
          <a className="transition hover:text-foreground" href="#why-noise">Защо шум?</a>
        </nav>
        <span className="rounded-full border border-white/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">
          Experiment 01
        </span>
      </header>

      <section id="top" className="relative mx-auto grid w-full max-w-[1440px] gap-12 px-5 pb-24 pt-14 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-20 lg:px-12 lg:pb-32 lg:pt-20">
        <div className="pointer-events-none absolute -left-48 top-0 h-[520px] w-[520px] rounded-full bg-[#613b8f]/15 blur-[110px]" />
        <div className="relative z-10 max-w-xl">
          <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#f3a177]">
            <Sparkles className="size-4" aria-hidden="true" />
            Интерактивно обяснение
          </p>
          <h1 className="text-balance text-[clamp(3.25rem,7vw,6.7rem)] font-medium leading-[0.91] tracking-[-0.065em]">
            От шум
            <span className="block text-[#afa3d9]">до образ.</span>
          </h1>
          <p className="mt-8 max-w-lg text-pretty text-lg leading-8 text-muted-foreground sm:text-xl">
            Виж как един diffusion модел превръща случайни числа в картинка — с много малки корекции, а не с един магически скок.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <a
              href="#lab"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-[#f08b5d] px-5 text-sm font-semibold text-[#181026] transition hover:bg-[#f6a07b]"
            >
              Започни експеримента
              <ArrowDown className="size-4" aria-hidden="true" />
            </a>
            <span className="text-sm text-white/40">Без формули. Засега.</span>
          </div>
        </div>

        <div id="lab" className="relative z-10 scroll-mt-8 rounded-[36px] border border-white/10 bg-[#15162d]/85 p-4 shadow-[0_40px_130px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <ModeSwitch mode={mode} onChange={changeMode} />
            <div className="flex items-center gap-2 font-mono text-xs text-white/45">
              <span className="size-1.5 rounded-full bg-[#72d7af] shadow-[0_0_12px_#72d7af]" />
              SIMULATION ACTIVE
            </div>
          </div>

          <DiffusionCanvas mode={mode} step={step} seed={seed} />

          <div className="px-1 pb-1 pt-6 sm:px-2">
            <div className="mb-5 flex min-h-[3.5rem] flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{phase.title}</p>
                <p className="mt-1 max-w-lg text-sm leading-6 text-white/50">{phase.detail}</p>
              </div>
              <span className="font-mono text-sm text-[#f3a177]">
                {String(step).padStart(2, '0')} / {TOTAL_STEPS}
              </span>
            </div>

            <Slider
              aria-label={`Стъпка от ${stepDirection[0]} към ${stepDirection[1]}`}
              min={0}
              max={TOTAL_STEPS}
              step={1}
              value={[step]}
              onValueChange={(value) => {
                setStep(value[0] ?? 0);
                setPlaying(false);
              }}
              className="[&_[data-slot=slider-range]]:bg-[#f08b5d] [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-[#f08b5d] [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-track]]:h-1.5 [&_[data-slot=slider-track]]:bg-white/10"
            />

            <div className="mt-2 flex justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
              <span>{stepDirection[0]}</span>
              <span>{stepDirection[1]}</span>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Button onClick={togglePlayback} className="h-10 rounded-full bg-white px-4 text-[#11122a] hover:bg-white/85">
                {playing ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
                {playing ? 'Пауза' : step === TOTAL_STEPS ? 'Отначало' : 'Пусни'}
              </Button>
              <Button
                variant="outline"
                onClick={chooseNewSeed}
                className="h-10 rounded-full border-white/10 bg-white/[0.035] px-4 text-white hover:bg-white/10"
              >
                <RefreshCw data-icon="inline-start" />
                Друг seed
              </Button>
              <p className="ml-auto text-xs leading-5 text-white/35">
                Учебна симулация, не запис от реален модел
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="process" className="relative border-y border-white/8 bg-[#0d0e20]">
        <div className="mx-auto w-full max-w-[1280px] px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f3a177]">Най-важната идея</p>
            <h2 className="mt-5 text-balance text-4xl font-medium leading-tight tracking-[-0.04em] sm:text-6xl">
              Моделът не намира скрита картинка в шума.
            </h2>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
              На всяка стъпка той предсказва коя малка промяна би направила текущото състояние по-вероятно спрямо текста. После повтаря това отново и отново.
            </p>
          </div>

          <div className="mt-16 grid gap-4 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-center">
            {[
              { number: '01', label: 'Noise', text: 'Случайна начална точка', icon: Waves },
              { number: '02', label: 'Prompt', text: 'Текстът задава посока', icon: BrainCircuit },
              { number: '03', label: 'Denoise', text: 'Малки последователни корекции', icon: Sparkles },
              { number: '04', label: 'Decode', text: 'Latent става видим образ', icon: ImageIcon },
            ].map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={item.number} className="contents">
                  <article className="group min-h-52 rounded-[26px] border border-white/10 bg-white/[0.035] p-6 transition hover:-translate-y-1 hover:bg-white/[0.055]">
                    <div className="flex items-center justify-between text-white/35">
                      <span className="font-mono text-xs">{item.number}</span>
                      <Icon className="size-5 text-[#afa3d9]" aria-hidden="true" />
                    </div>
                    <h3 className="mt-12 text-xl font-semibold">{item.label}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.text}</p>
                  </article>
                  {index < 3 && <ArrowRight className="mx-auto hidden size-4 text-white/20 lg:block" aria-hidden="true" />}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="why-noise" className="mx-auto grid w-full max-w-[1280px] gap-16 px-5 py-24 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:px-12 lg:py-32">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f3a177]">Защо започваме с noise?</p>
          <h2 className="mt-5 text-4xl font-medium leading-tight tracking-[-0.04em] sm:text-5xl">
            Защото хаосът е удобна начална точка.
          </h2>
        </div>
        <div className="divide-y divide-white/10 border-y border-white/10">
          {[
            ['01', 'Прост е', 'Gaussian noise се генерира лесно и има предвидими математически свойства.'],
            ['02', 'Дава разнообразие', 'Различният seed означава различна начална случайност — и при истински модел, различен възможен резултат.'],
            ['03', 'Разбива трудната задача', 'Вместо да измисли всички пиксели наведнъж, моделът прави поредица от по-малки решения.'],
          ].map(([number, title, text]) => (
            <article key={number} className="grid gap-4 py-8 sm:grid-cols-[54px_180px_1fr] sm:items-start">
              <span className="font-mono text-xs text-white/30">{number}</span>
              <h3 className="text-lg font-semibold">{title}</h3>
              <p className="max-w-xl text-base leading-7 text-muted-foreground">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-t border-white/8 bg-[#0d0e20]">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col items-start justify-between gap-8 px-5 py-14 sm:flex-row sm:items-center sm:px-8 lg:px-12">
          <div>
            <p className="text-sm font-semibold">Следващ експеримент</p>
            <p className="mt-1 text-sm text-muted-foreground">Как текстът се превръща в посока за изображението?</p>
          </div>
          <span className="inline-flex items-center gap-2 text-sm text-white/35">
            Скоро
            <ChevronRight className="size-4" aria-hidden="true" />
          </span>
        </div>
      </section>
    </main>
  );
}
