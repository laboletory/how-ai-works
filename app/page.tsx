'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  ArrowDown,
  ArrowRight,
  BrainCircuit,
  ChevronDown,
  CircleDot,
  Equal,
  LockKeyhole,
  MessageSquareText,
  Minus,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sigma,
  Sparkles,
  Waves,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { ExplanationDialog } from '@/components/explanation-dialog';
import { TrainingPairExplorer } from '@/components/training-pair-explorer';
import { LearningCycleIllustrations } from '@/components/learning-cycle-illustrations';
import { WhatIsNoise } from '@/components/what-is-noise';
import { TrainingExampleCards } from '@/components/training-example-cards';

const TOTAL_STEPS = 20;
const GRID_SIZE = 12;
const CELL_COUNT = GRID_SIZE * GRID_SIZE;
const SELECTED_CELL = 77;
const PROMPT = 'малка червена лисица под голяма луна';

type Mode = 'generate' | 'train';
type ConceptKey = 'moon' | 'fox' | 'under' | 'ground';

function moveBetweenTabs(event: KeyboardEvent<HTMLButtonElement>) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const tabs = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? []);
  if (!tabs.length) return;
  event.preventDefault();
  const current = tabs.indexOf(event.currentTarget);
  const next = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? tabs.length - 1
      : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  tabs[next]?.focus();
  tabs[next]?.click();
}

type GenerationState = {
  current: number[];
  predictedNoise: number[];
  next: number[];
  targetField: number[];
  timestep: number;
  schedulerStrength: number;
};

type TrainingState = {
  clean: number[];
  noise: number[];
  noisy: number[];
  predictedNoise: number[];
  error: number[];
  alpha: number;
  sigma: number;
  loss: number;
  timestep: number;
};

function hashNoise(value: number) {
  let x = value | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return ((x >>> 0) / 4294967295) * 2 - 1;
}

function makeNoise(seed: number, salt = 0) {
  return Array.from({ length: CELL_COUNT }, (_, index) =>
    hashNoise(seed * 1009 + index * 313 + salt * 7919),
  );
}

function gaussian(x: number, y: number, cx: number, cy: number, radius: number) {
  const distance = (x - cx) ** 2 + (y - cy) ** 2;
  return Math.exp(-distance / (2 * radius * radius));
}

function makePromptField(seed: number) {
  const drift = (seed % 5) * 0.14;
  return Array.from({ length: CELL_COUNT }, (_, index) => {
    const x = index % GRID_SIZE;
    const y = Math.floor(index / GRID_SIZE);
    const moon = gaussian(x, y, 6 - drift * 0.3, 2.5, 1.55) * 0.95;
    const body = gaussian(x, y, 5.7 + drift, 8.1, 1.8) * 0.85;
    const head = gaussian(x, y, 5.8 + drift, 5.9, 1.05) * 0.72;
    const hill = gaussian(x, y, 5.5, 11.5, 4.8) * 0.52;
    const sky = Math.sin(x * 0.7 + y * 0.25 + seed) * 0.08;
    return Math.max(-1, Math.min(1, moon + body + head - hill + sky - 0.27));
  });
}

function makeConceptInfluence(concept: ConceptKey, seed: number) {
  const drift = (seed % 5) * 0.14;
  return Array.from({ length: CELL_COUNT }, (_, index) => {
    const x = index % GRID_SIZE;
    const y = Math.floor(index / GRID_SIZE);

    if (concept === 'moon') {
      return gaussian(x, y, 6 - drift * 0.3, 2.5, 1.75);
    }

    if (concept === 'fox') {
      return Math.min(
        1,
        gaussian(x, y, 5.7 + drift, 8.1, 2.1) * 0.9 +
          gaussian(x, y, 5.8 + drift, 5.9, 1.25) * 0.75,
      );
    }

    if (concept === 'under') {
      const moonZone = gaussian(x, y, 6 - drift * 0.3, 2.5, 2.5);
      const foxZone = gaussian(x, y, 5.7 + drift, 7.5, 2.8);
      return Math.min(1, (moonZone + foxZone) * 0.58);
    }

    return gaussian(x, y, 5.5, 11.5, 5.3) * 0.85;
  });
}

function predictResidual(current: number[], target: number[], timestep: number, step: number) {
  const timeScale = 0.68 + timestep * 0.16;
  return current.map((value, index) => {
    const learnedCorrection = (value - target[index]) * timeScale;
    const approximationError = Math.sin(index * 1.37 + step * 0.8) * 0.025 * timestep;
    return learnedCorrection + approximationError;
  });
}

function buildGenerationState(step: number, seed: number): GenerationState {
  const targetField = makePromptField(seed);
  let current = makeNoise(seed, 4);

  for (let iteration = 0; iteration < step; iteration += 1) {
    const timestep = 1 - iteration / TOTAL_STEPS;
    const predicted = predictResidual(current, targetField, timestep, iteration);
    const strength = 0.13 + (1 - timestep) * 0.08;
    current = current.map((value, index) => value - predicted[index] * strength);
  }

  const timestep = Math.max(0, 1 - step / TOTAL_STEPS);
  const schedulerStrength = step >= TOTAL_STEPS ? 0 : 0.13 + (1 - timestep) * 0.08;
  const predictedNoise =
    step >= TOTAL_STEPS
      ? current.map(() => 0)
      : predictResidual(current, targetField, timestep, step);
  const next = current.map((value, index) => value - predictedNoise[index] * schedulerStrength);

  return {
    current,
    predictedNoise,
    next,
    targetField,
    timestep: Math.round(timestep * 1000),
    schedulerStrength,
  };
}

function buildTrainingState(step: number, seed: number): TrainingState {
  const clean = makePromptField(seed);
  const noise = makeNoise(seed, 11);
  const normalizedTime = step / TOTAL_STEPS;
  const alpha = Math.cos((normalizedTime * Math.PI) / 2);
  const sigma = Math.sin((normalizedTime * Math.PI) / 2);
  const noisy = clean.map((value, index) => alpha * value + sigma * noise[index]);
  const predictedNoise = noise.map((value, index) => {
    const confidence = 0.78 + normalizedTime * 0.18;
    const approximationError = Math.sin(index * 0.91 + step * 0.6) * 0.065;
    return value * confidence + approximationError;
  });
  const error = predictedNoise.map((value, index) => value - noise[index]);
  const loss = error.reduce((sum, value) => sum + value * value, 0) / error.length;

  return {
    clean,
    noise,
    noisy,
    predictedNoise,
    error,
    alpha,
    sigma,
    loss,
    timestep: Math.round(normalizedTime * 1000),
  };
}

function latentColor(value: number) {
  const normalized = Math.min(1, Math.abs(value));
  const hue = value >= 0 ? 28 : 273;
  const saturation = (42 + normalized * 38) / 100;
  const lightness = (17 + normalized * 56) / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const hueSection = hue / 60;
  const secondary = chroma * (1 - Math.abs((hueSection % 2) - 1));
  const match = lightness - chroma / 2;
  const [red, green, blue] =
    hueSection < 1
      ? [chroma, secondary, 0]
      : hueSection < 2
        ? [secondary, chroma, 0]
        : hueSection < 3
          ? [0, chroma, secondary]
          : hueSection < 4
            ? [0, secondary, chroma]
            : hueSection < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];

  return `rgb(${Math.round((red + match) * 255)}, ${Math.round((green + match) * 255)}, ${Math.round((blue + match) * 255)})`;
}

function number(value: number) {
  const clean = Math.abs(value) < 0.005 ? 0 : value;
  return clean.toFixed(2);
}

function LatentGrid({
  values,
  label,
  selected = false,
}: {
  values: number[];
  label: string;
  selected?: boolean;
}) {
  return (
    <div
      role="img"
      aria-label={`${label}. Матрица ${GRID_SIZE} на ${GRID_SIZE} с числови стойности, показани с условни цветове.`}
      className="grid aspect-square w-full gap-px overflow-hidden rounded-xl bg-white/10 p-px"
      style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
    >
      {values.map((value, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`min-w-0 transition-colors duration-300 ${
            selected && index === SELECTED_CELL
              ? 'relative z-10 ring-2 ring-inset ring-white'
              : ''
          }`}
          style={{ backgroundColor: latentColor(value) }}
        />
      ))}
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  description,
  technicalName,
  showTechnical = false,
  values,
  selected,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  technicalName?: string;
  showTechnical?: boolean;
  values?: number[];
  selected?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <article className="rounded-[24px] border border-white/10 bg-white/[0.035] p-4 sm:p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f3a177]">
        {eyebrow}
      </p>
      <div className="mt-2 min-h-20">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {showTechnical && technicalName && (
          <p className="mt-1 font-mono text-[10px] text-[#afa3d9]">
            техническо име: {technicalName}
          </p>
        )}
        <p className="mt-1 text-sm leading-5 text-white/45">{description}</p>
      </div>
      {values && <LatentGrid values={values} label={title} selected={selected} />}
      {children}
    </article>
  );
}

function FlowArrow({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1 text-white/25 lg:flex-col lg:px-1 lg:py-0">
      <ArrowDown className="size-4 lg:hidden" aria-hidden="true" />
      <ArrowRight className="hidden size-4 lg:block" aria-hidden="true" />
      <span className="font-mono text-[9px] uppercase tracking-[0.12em] lg:[writing-mode:vertical-rl]">
        {label}
      </span>
    </div>
  );
}

function PromptStrip({ showTechnical }: { showTechnical: boolean }) {
  const tokens = PROMPT.split(' ');

  return (
    <section className="mb-5 rounded-[24px] border border-[#f3a177]/18 bg-[#0d0e20] p-4 sm:p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f3a177]">Стартът на генерирането</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Ти даваш prompt. AI започва от шум.</h3>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Prompt-ът казва какво искаме да се появи. AI превежда думите в числови подсказки, които насочват всяка следваща промяна в шума.
          </p>
        </div>
      </div>

      <div className="grid items-stretch gap-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <div className="rounded-2xl border border-[#f3a177]/20 bg-[#f3a177]/[0.06] p-4">
          <div className="flex items-center gap-2 text-[#f3a177]">
            <MessageSquareText className="size-4" aria-hidden="true" />
            <p className="font-mono text-[10px] uppercase tracking-[0.14em]">1 · твоят prompt</p>
          </div>
          <blockquote className="mt-4 text-base font-semibold leading-6 text-white">
            „{PROMPT}“
          </blockquote>
          <p className="mt-3 text-xs leading-5 text-white/50">Това е инструкцията, която ние пишем на AI.</p>
        </div>

        <FlowArrow label="разделя думите" />

        <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">2 · части от изречението</p>
          <div className="mt-4 flex flex-wrap gap-1.5" aria-label={`Думи в prompt-а: ${PROMPT}`}>
            {tokens.map((token, index) => (
              <span
                key={`${token}-${index}`}
                className={`rounded-md px-2 py-1 text-xs ${
                  ['лисица', 'луна', 'под'].includes(token)
                    ? 'bg-[#f08b5d]/15 text-[#f3a177]'
                    : 'bg-white/5 text-white/60'
                }`}
              >
                {token}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-white/50">Думите и връзките между тях се разглеждат заедно.</p>
        </div>

        <FlowArrow label="превежда в числа" />

        <div className="rounded-2xl border border-[#afa3d9]/15 bg-[#afa3d9]/[0.045] p-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#afa3d9]">3 · числови подсказки</p>
          <div className="mt-4 space-y-2 font-mono text-[11px]">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.035] px-3 py-2">
              <span className="text-[#f3a177]">лисица</span>
              <span className="text-white/55">[0.42, −0.18, 0.77, …]</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.035] px-3 py-2">
              <span className="text-[#f3a177]">луна</span>
              <span className="text-white/55">[−0.06, 0.91, 0.24, …]</span>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-white/50">Това са учебни примерни числа, не готови части от картинка.</p>
          {showTechnical && (
            <p className="mt-3 border-t border-white/8 pt-3 font-mono text-[10px] text-[#afa3d9]">
              text encoder → context-dependent embeddings c
            </p>
          )}
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-5 text-white/30">
        Оцветяването само откроява думи за примера. В истинския модел всички думи могат да влияят при всяка стъпка.
      </p>
    </section>
  );
}

const WEIGHTS_BEFORE = [0.18, -0.42, 0.07, 0.61, -0.25, 0.33, 0.72, -0.14, 0.49, 0.05, -0.38, 0.27];
const WEIGHTS_AFTER = [0.18, -0.41, 0.07, 0.61, -0.25, 0.35, 0.71, -0.14, 0.49, 0.05, -0.37, 0.27];

function WeightGrid({ values, changed = [] }: { values: number[]; changed?: number[] }) {
  return (
    <div
      role="img"
      aria-label="Учебен откъс от матрица с числови тежести"
      className="grid grid-cols-4 gap-1 font-mono text-[10px]"
    >
      {values.map((value, index) => (
        <span
          key={index}
          className={`rounded-md border px-1.5 py-2 text-center transition ${
            changed.includes(index)
              ? 'border-[#72d7af]/30 bg-[#72d7af]/10 text-[#9ee3c8]'
              : 'border-white/8 bg-white/[0.035] text-white/45'
          }`}
        >
          {value.toFixed(2)}
        </span>
      ))}
    </div>
  );
}

function WeightsExplainer({ mode, showTechnical }: { mode: Mode; showTechnical: boolean }) {
  const isTraining = mode === 'train';

  return (
    <section className={`mt-5 rounded-[24px] border p-4 sm:p-5 ${
      isTraining ? 'border-[#72d7af]/20 bg-[#72d7af]/[0.04]' : 'border-[#f3a177]/18 bg-[#f3a177]/[0.035]'
    }`}>
      <div className="max-w-3xl">
        <p className={`font-mono text-[10px] uppercase tracking-[0.16em] ${isTraining ? 'text-[#72d7af]' : 'text-[#f3a177]'}`}>
          {isTraining ? 'Какво остава след упражнението?' : 'Как наученото участва в генерирането?'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h3 className="text-xl font-semibold">
            {isTraining ? 'Записваме променените тежести, не самата картинка' : 'Тежестите са заредени и заключени'}
          </h3>
          <ExplanationDialog
            label="Какво са тежестите?"
            title="Тежестите са научените настройки на AI"
            accent={isTraining ? 'mint' : 'peach'}
          >
            <p>Представи си огромен пулт с много малки регулатори. Всеки регулатор е число, което влияе колко силно AI да използва определена връзка.</p>
            <p><strong className="text-white">При обучението</strong> грешката мести по малко някои от тези числа. След много примери в тях остават научените закономерности.</p>
            <p><strong className="text-white">При генерирането</strong> тежестите не се променят. AI използва вече научените числа — не търси оригиналните тренировъчни картинки.</p>
          </ExplanationDialog>
        </div>
        <p className="mt-2 text-sm leading-6 text-white/55">
          {isTraining
            ? 'Грешката показва кои научени числа трябва да се коригират. Милиони упражнения променят по малко огромен брой тежести.'
            : 'Моделът използва научените тежести, за да свърже prompt-векторите с текущата шумна скица. По време на това генериране тежестите не се променят.'}
        </p>
      </div>

      {isTraining ? (
        <div className="mt-5 grid items-center gap-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <div className="rounded-2xl border border-white/10 bg-[#0d0e20] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">1 · преди поправката</p>
            <div className="mt-3"><WeightGrid values={WEIGHTS_BEFORE} /></div>
          </div>
          <FlowArrow label="грешка 0.084" />
          <div className="rounded-2xl border border-[#72d7af]/18 bg-[#0d0e20] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#72d7af]">2 · малка корекция</p>
            <div className="mt-3"><WeightGrid values={WEIGHTS_AFTER} changed={[1, 5, 6, 10]} /></div>
          </div>
          <FlowArrow label="повтаряме много пъти" />
          <div className="rounded-2xl border border-[#72d7af]/18 bg-[#72d7af]/[0.055] p-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#72d7af]/12 text-[#72d7af]"><BrainCircuit className="size-5" aria-hidden="true" /></span>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#72d7af]">3 · обученият модел</p>
                <p className="mt-1 text-sm font-semibold">Огромна система от научени числа</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-white/55">Това е „паметта“ на модела: не папка с картинки, а разпределени закономерности в много тежести.</p>
          </div>
        </div>
      ) : (
        <div className="mt-5 grid items-center gap-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <div className="rounded-2xl border border-[#f3a177]/18 bg-[#0d0e20] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#f3a177]">1 · научени тежести</p>
              <LockKeyhole className="size-4 text-[#f3a177]" aria-hidden="true" />
            </div>
            <div className="mt-3"><WeightGrid values={WEIGHTS_AFTER} /></div>
            <p className="mt-3 text-xs text-white/50">Еднакви за всички стъпки на тази генерация.</p>
          </div>
          <div className="flex items-center justify-center gap-2 py-1 text-white/25 lg:flex-col lg:px-1 lg:py-0">
            <Plus className="size-4" aria-hidden="true" />
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] lg:[writing-mode:vertical-rl]">временни входове</span>
          </div>
          <div className="space-y-2 rounded-2xl border border-white/10 bg-[#0d0e20] p-4">
            <div className="rounded-lg bg-white/[0.035] px-3 py-2">
              <p className="font-mono text-[9px] uppercase text-[#afa3d9]">prompt-вектор</p>
              <p className="mt-1 font-mono text-[11px] text-white/55">[0.42, −0.18, 0.77, …]</p>
            </div>
            <div className="rounded-lg bg-white/[0.035] px-3 py-2">
              <p className="font-mono text-[9px] uppercase text-[#afa3d9]">текуща шумна скица</p>
              <p className="mt-1 font-mono text-[11px] text-white/55">12 × 12 × много числа</p>
            </div>
          </div>
          <FlowArrow label="изчислява" />
          <div className="rounded-2xl border border-[#f3a177]/18 bg-[#f3a177]/[0.055] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#f3a177]">2 · следваща промяна</p>
            <p className="mt-3 text-base font-semibold">Къде и колко да се промени шумът</p>
            <p className="mt-2 text-xs leading-5 text-white/55">Променя се временната скица. Научените тежести остават същите.</p>
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-2 border-t border-white/8 pt-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white/[0.025] p-3 text-xs leading-5 text-white/50"><strong className="block text-white/75">Вектор</strong>Подреден ред от числа за текуща дума, област или състояние.</div>
        <div className="rounded-xl bg-white/[0.025] p-3 text-xs leading-5 text-white/50"><strong className="block text-white/75">Матрица</strong>Таблица от числа, която може да преобразува много вектори.</div>
        <div className="rounded-xl bg-white/[0.025] p-3 text-xs leading-5 text-white/50"><strong className="block text-white/75">Тежест</strong>Едно научено число, което определя колко силно да влияе даден сигнал.</div>
      </div>

      {showTechnical && (
        <p className="mt-4 font-mono text-[10px] leading-5 text-[#afa3d9]">
          {isTraining
            ? 'backpropagation изчислява gradients → optimizer обновява parameters (матрици и многомерни tensors)'
            : 'inference / forward pass: parameters са frozen; обновява се само текущият latent zₜ'}
        </p>
      )}
    </section>
  );
}

const conceptExplanations: Record<
  ConceptKey,
  { label: string; kind: string; title: string; text: string; answer: string }
> = {
  moon: {
    label: 'луна',
    kind: 'дума от изречението',
    title: '„Луна“ не е готов кръг за поставяне',
    text: 'AI превръща думата в група числа. При всяка стъпка сравнява тези числа с различни области от скритата скица. Така промените постепенно започват да носят научените особености на луна.',
    answer: 'Позицията не е написана като координата. Тя се оформя от началните случайни числа, останалите думи и научените композиции.',
  },
  fox: {
    label: 'лисица',
    kind: 'дума от изречението',
    title: '„Лисица“ влияе на много места и канали',
    text: 'AI не пази отделно готово парче „лисица“. Думата направлява много свързани характеристики — силует, козина, уши, цвят и поза — разпръснати из цялата скрита скица.',
    answer: 'Опашката не е една клетка. Тя възниква от общ модел в много клетки, канали и последователни стъпки.',
  },
  under: {
    label: 'под',
    kind: 'отношение',
    title: '„Под“ променя връзката между елементите',
    text: 'Тази дума не описва нов предмет. Тя помага на AI да съгласува подредбата: луната по-високо, лисицата по-ниско.',
    answer: 'Значението е в отношенията между области, не в една конкретна клетка.',
  },
  ground: {
    label: 'земя',
    kind: 'научено подразбиране',
    title: 'Земята може да се появи, без да е написана',
    text: 'От обучението моделът е научил, че животно обикновено има опора и че нощните сцени често съдържат терен. Това е вероятно допълване, а не правило.',
    answer: 'Затова моделът може да добави земя — но може и да избере сняг, скала или нищо ясно различимо.',
  },
};

function SpatialInfluenceMap({ values, label }: { values: number[]; label: string }) {
  const activeCells = values.filter((value) => value > 0.35).length;

  return (
    <div>
      <div
        role="img"
        aria-label={`${label}. Учебната решетка е наложена върху цялата примерна сцена.`}
        className="relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-[#0d0e20]"
      >
        <img
          src="/fox-moon.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 size-full object-cover opacity-80"
        />
        <div
          className="absolute inset-0 grid"
          style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
          aria-hidden="true"
        >
          {values.map((value, index) => {
            const strength = Math.min(1, Math.max(0, value));
            const heatClass =
              strength > 0.72
                ? 'bg-[#f3a177]/75 ring-1 ring-inset ring-white/70'
                : strength > 0.48
                  ? 'bg-[#f3a177]/55 ring-1 ring-inset ring-white/45'
                  : strength > 0.24
                    ? 'bg-[#f3a177]/35'
                    : strength > 0.08
                      ? 'bg-[#f3a177]/15'
                      : 'bg-transparent';
            return (
              <span
                key={index}
                className={`border-b border-r border-white/20 ${heatClass}`}
              />
            );
          })}
        </div>
        <div className="absolute inset-x-2 top-2 flex items-center justify-between gap-2 text-[9px] font-semibold uppercase tracking-[0.1em]">
          <span className="rounded-full bg-[#0d0e20]/85 px-2 py-1 text-white/70 backdrop-blur-sm">
            цялата примерна сцена
          </span>
          <span className="rounded-full bg-[#f3a177]/90 px-2 py-1 text-[#181026]">
            по-силно влияние
          </span>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-white/35">
        <span>Решетка: {GRID_SIZE}×{GRID_SIZE}</span>
        <span>по-силно осветени: {activeCells} от {CELL_COUNT}</span>
      </div>
    </div>
  );
}

function ConceptInfluenceExplorer({ seed, showTechnical }: { seed: number; showTechnical: boolean }) {
  const [concept, setConcept] = useState<ConceptKey>('moon');
  const selected = conceptExplanations[concept];
  const influence = useMemo(() => makeConceptInfluence(concept, seed), [concept, seed]);

  return (
    <div className="mb-5 rounded-[24px] border border-[#afa3d9]/20 bg-[#afa3d9]/[0.045] p-4 sm:p-5">
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#afa3d9]">
            Междинното звено · как думите насочват процеса
          </p>
          {showTechnical && (
            <p className="mt-1 font-mono text-[10px] text-white/30">
              техническо име: text conditioning и cross-attention
            </p>
          )}
          <h3 className="mt-2 text-xl font-semibold">Как моделът „разбира“ какво да се появи?</h3>
          <p className="mt-2 text-sm leading-6 text-white/50">
            Избери дума или подразбиране. Решетката върху цялата сцена показва кои области тя насочва по-силно в нашия учебен пример.
          </p>
          <div className="mt-4 grid grid-cols-4 gap-1.5" aria-label="Избери концепт">
            {(Object.keys(conceptExplanations) as ConceptKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setConcept(key)}
                aria-pressed={concept === key}
                className="rounded-lg border border-white/8 bg-white/[0.035] px-2 py-2 text-xs text-white/50 transition hover:bg-white/8 hover:text-white aria-pressed:border-[#afa3d9]/35 aria-pressed:bg-[#afa3d9]/15 aria-pressed:text-white"
              >
                {conceptExplanations[key].label}
              </button>
            ))}
          </div>
          <div className="mt-4 max-w-[420px]">
            <SpatialInfluenceMap values={influence} label={`Карта на влияние: ${selected.label}`} />
          </div>
          <p className="mt-3 text-[11px] leading-4 text-white/30">
            Картинката отдолу е справочна — тя ни помага да видим кое е „горе“ и „долу“. При истинското генериране готовата сцена още не съществува.
          </p>
          {showTechnical && (
            <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.025] p-3 text-[11px] leading-5 text-white/35">
              В класическия Stable Diffusion v1 изображение 512×512 съответства на скрита карта 64×64×4. Това е 8× свиване по ширина и височина, но не означава, че една позиция „притежава“ точно един блок 8×8 пиксела — съседните позиции се смесват при декодирането.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/8 bg-[#0d0e20] p-5">
          <span className="rounded-full bg-white/5 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
            {selected.kind}
          </span>
          <h4 className="mt-4 text-lg font-semibold text-white">{selected.title}</h4>
          <p className="mt-3 text-sm leading-6 text-white/55">{selected.text}</p>
          <div className="mt-5 rounded-xl border border-[#f3a177]/15 bg-[#f3a177]/[0.055] p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#f3a177]">
              Краткият отговор за ученика
            </p>
            <p className="mt-2 text-sm leading-6 text-white/70">{selected.answer}</p>
          </div>
          <div className="mt-5 grid gap-2 text-xs text-white/45 sm:grid-cols-3">
            <div className="rounded-xl bg-white/[0.035] p-3"><strong className="block text-white/70">1 · думи</strong><span className="mt-1 block">стават числови подсказки</span></div>
            <div className="rounded-xl bg-white/[0.035] p-3"><strong className="block text-white/70">2 · сравнение</strong><span className="mt-1 block">подсказките насочват области</span></div>
            <div className="rounded-xl bg-white/[0.035] p-3"><strong className="block text-white/70">3 · повторение</strong><span className="mt-1 block">структурата се уточнява</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GenerationLab({ seed, showTechnical }: { seed: number; showTechnical: boolean }) {
  const [chapter, setChapter] = useState<'words' | 'step' | 'detail'>('step');
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const displayedState = useMemo(() => buildGenerationState(step, seed), [seed, step]);
  // Inspect the last applied correction (or preview the first), never a terminal no-op.
  const state = useMemo(() => buildGenerationState(Math.max(0, step - 1), seed), [seed, step]);
  useEffect(() => {
    if (!playing || chapter !== 'step' || step >= TOTAL_STEPS) return;
    const timer = window.setTimeout(() => {
      setStep(step + 1);
      if (step + 1 === TOTAL_STEPS) setPlaying(false);
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [playing, chapter, step]);

  const currentValue = state.current[SELECTED_CELL];
  const predictedValue = state.predictedNoise[SELECTED_CELL];
  const nextValue = state.next[SELECTED_CELL];

  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-[#f3a177]">
        Генериране · стъпка {chapter === 'step' ? 1 : chapter === 'words' ? 2 : 3} от 3
      </p>
      <div className="mb-6 grid grid-cols-3 gap-1 rounded-2xl border border-white/8 bg-[#0d0e20] p-1.5" role="tablist" aria-label="Части на упражнението за генериране">
        {([
          ['step', '1. Опитай'],
          ['words', '2. Думите'],
          ['detail', '3. Под микроскоп'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setChapter(key); setPlaying(false); }}
            id={`generation-tab-${key}`}
            role="tab"
            aria-selected={chapter === key}
            aria-controls={`generation-panel-${key}`}
            tabIndex={chapter === key ? 0 : -1}
            onKeyDown={moveBetweenTabs}
            className={`rounded-xl px-2 py-3 text-xs font-semibold transition sm:text-sm ${
              chapter === key ? 'bg-[#f3a177] text-[#181026]' : 'text-white/45 hover:bg-white/5 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {chapter === 'words' && (
        <section id="generation-panel-words" role="tabpanel" aria-labelledby="generation-tab-words">
          <PromptStrip showTechnical={showTechnical} />
          <ConceptInfluenceExplorer seed={seed} showTechnical={showTechnical} />
          <div className="mt-5 flex justify-end">
            <Button onClick={() => setChapter('detail')} className="min-h-11 rounded-full bg-[#f3a177] px-5 text-[#181026] hover:bg-[#f3a177]/85">
              Продължи: под микроскоп<ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </section>
      )}

      {chapter === 'step' && (
        <section id="generation-panel-step" role="tabpanel" aria-labelledby="generation-tab-step" className="rounded-[22px] border border-[#f3a177]/20 bg-[#0d0e20] p-4 sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <MessageSquareText className="mt-1 size-5 shrink-0 text-[#f3a177]" aria-hidden="true" />
            <div>
              <p className="text-xs text-white/50">Твоята заявка към AI (prompt)</p>
              <h3 className="mt-1 text-base font-semibold sm:text-xl">„{PROMPT}“</h3>
            </div>
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] lg:items-center">
            <div className="grid grid-cols-2 gap-3 sm:gap-5">
              <figure>
                <figcaption className="mb-2 text-xs font-semibold text-white/65">{step === TOTAL_STEPS ? 'Числовата скица' : step === 0 ? 'Началото: случаен шум' : `Преди поправка ${step}`}</figcaption>
                <LatentGrid values={step === TOTAL_STEPS ? displayedState.current : state.current} label={step === TOTAL_STEPS ? 'Завършена числова скица' : 'Преди поправката'} selected />
              </figure>
              <figure>
                <figcaption className="mb-2 text-xs font-semibold text-[#f3a177]">{step === TOTAL_STEPS ? 'Примерна картинка' : step === 0 ? 'След твоята поправка…' : `След поправка ${step}`}</figcaption>
                {step === TOTAL_STEPS ? (
                  <img src="/fox-moon.webp" alt="Илюстрация на крайния резултат: лисица под луната" className="aspect-square w-full rounded-xl object-cover" />
                ) : step === 0 ? (
                  <div className="flex aspect-square flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#f3a177]/25 bg-[#f3a177]/[0.035] px-3 text-center text-xs leading-5 text-white/55">
                    <ArrowRight className="size-6 text-[#f3a177]" aria-hidden="true" />
                    Тук ще видиш какво се промени
                  </div>
                ) : (
                  <LatentGrid values={displayedState.current} label="След поправката" selected />
                )}
              </figure>
            </div>
            <div>
              <div aria-live="polite" aria-atomic="true">
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#f3a177]">{step === 0 ? 'Започни с една промяна' : `Поправка ${step} от ${TOTAL_STEPS}`}</p>
                <h4 className="mt-2 text-base font-semibold sm:text-lg">{step === TOTAL_STEPS ? 'След поправките идва преводът в картинка' : 'Следим бялото квадратче'}</h4>
                {step < TOTAL_STEPS && (
                  <p className="my-3 flex items-center gap-3 font-mono text-2xl sm:text-3xl">
                    <span>{number(currentValue)}</span><ArrowRight className="size-5 text-white/35" aria-hidden="true" /><span className="text-[#f3a177]">{step === 0 ? '?' : number(displayedState.current[SELECTED_CELL])}</span>
                  </p>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {step < TOTAL_STEPS && <Button disabled={playing} onClick={() => setStep((value) => Math.min(TOTAL_STEPS, value + 1))} className="min-h-11 rounded-full bg-[#f3a177] px-4 text-[#181026] hover:bg-[#f3a177]/85"><ArrowRight data-icon="inline-start" />{step === 0 ? 'Приложи една поправка' : 'Следваща поправка'}</Button>}
                {step > 0 && step < TOTAL_STEPS && <Button variant="outline" onClick={() => setPlaying((value) => !value)} className="min-h-11 rounded-full">{playing ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}{playing ? 'Пауза' : 'Продължи автоматично'}</Button>}
                {step > 0 && <button type="button" onClick={() => { setPlaying(false); setStep(0); }} className="min-h-11 rounded-full px-3 text-xs text-white/65 hover:bg-white/5">Отначало</button>}
              </div>
              <p className="mt-3 text-sm leading-6 text-white/60">
                {step === TOTAL_STEPS
                  ? 'В истински модел числовата скица се превежда в пиксели. Тук показваме готова илюстрация — тя не е получена от числата в тази демонстрация.'
                  : step === 0
                    ? 'Натисни бутона. Поправяме числата в цялата решетка; бялото квадратче помага да проследиш едно от тях.'
                    : 'Числото се промени. Промениха се и останалите клетки — не добавихме готово ухо, луна или опашка. Много такива малки поправки уточняват цялата скица.'}
              </p>
            </div>
          </div>
          <p className="mt-5 border-t border-white/8 pt-3 text-xs leading-5 text-white/45">Учебна симулация, не истинско генериране. Цветовете показват числа, не цветовете на лисицата. {step > 0 && step < TOTAL_STEPS ? 'Сравняваш две съседни състояния; разликата нарочно е малка.' : ''}</p>
          <div className="mt-5 flex justify-end">
            <Button onClick={() => { setPlaying(false); setChapter('words'); }} className="min-h-11 rounded-full bg-[#f3a177] px-5 text-[#181026] hover:bg-[#f3a177]/85">
              Продължи: как думите насочват<ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        </section>
      )}

      {chapter === 'detail' && (
        <section id="generation-panel-detail" role="tabpanel" aria-labelledby="generation-tab-detail">
        <p className="mb-4 text-sm text-white/60">{step === 0 ? 'Как ще изчислим първата поправка.' : `Как изчислихме поправка ${step}.`} За да продължиш, върни се в „1. Опитай“.</p>
        <div className="mb-4 grid items-stretch gap-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <Panel eyebrow="01 · вход" title="Сегашната скрита скица" technicalName="текущ latent zₜ" showTechnical={showTechnical} description="Числовото състояние преди поправката." values={state.current} selected />
          <FlowArrow label="AI предлага" />
          <Panel eyebrow="02 · предложение" title="Малката промяна" technicalName="предвиден шум ε̂θ" showTechnical={showTechnical} description="Предложение какво леко да се промени във всички области." values={state.predictedNoise} selected />
          <FlowArrow label="прилагаме част" />
          <Panel eyebrow="03 · резултат" title="Обновената скица" technicalName="следващ latent zₜ₋₁" showTechnical={showTechnical} description="Това отново е описание на цялата сцена, не отделен обект." values={state.next} selected />
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[22px] border border-white/10 bg-[#0d0e20] p-5">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#afa3d9]">Едно квадратче под микроскоп · [6,5]</p>
            <h3 className="mt-2 text-lg font-semibold">Квадратчето не означава „опашка“</h3>
            <p className="mt-2 text-sm leading-6 text-white/55">То съдържа част от общото описание и работи със съседните клетки. Вземаме старото число и изваждаме малка част от предложената промяна.</p>
            <div className="mt-5 flex flex-wrap items-center gap-2 font-mono text-sm sm:text-base">
              <span className="rounded-lg bg-white/5 px-3 py-2 text-white">{number(currentValue)}</span>
              <Minus className="size-4 text-white/30" aria-hidden="true" />
              <span className="rounded-lg bg-[#f08b5d]/10 px-3 py-2 text-[#f3a177]">{state.schedulerStrength.toFixed(2)} × {number(predictedValue)}</span>
              <Equal className="size-4 text-white/30" aria-hidden="true" />
              <span className="rounded-lg bg-[#afa3d9]/10 px-3 py-2 text-[#c9bdf1]">{number(nextValue)}</span>
            </div>
            <details className="mt-5 border-t border-white/8 pt-4 text-sm text-white/50">
              <summary className="cursor-pointer font-semibold text-white/70">Какво са цветните квадратчета?</summary>
              <p className="mt-3 leading-6">Това е опростена скрита скица от числа. Цветовете само ни помагат да ги видим — те още не са цветовете на крайната картинка.</p>
            </details>
          </div>

          <div className="overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.035]">
              <div className="grid h-full min-h-48 grid-cols-[0.9fr_1.1fr]">
                <img src="/fox-moon.webp" alt="Справочна илюстрация: червена лисица под луната" className="h-full min-h-48 w-full object-cover" />
                <div className="flex flex-col justify-center p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f3a177]">След последната поправка</p>
                  <p className="mt-2 text-base font-semibold">Скрита скица → картинка</p>
                  {showTechnical && <p className="mt-1 font-mono text-[10px] text-[#afa3d9]">техническо име: VAE decoder</p>}
                  <p className="mt-2 text-xs leading-5 text-white/55">В истински модел всички скрити числа заедно се превеждат в пиксели. Тази готова илюстрация само показва идеята — не е декодирана от нашата решетка.</p>
                </div>
              </div>
          </div>
        </div>
        <WeightsExplainer mode="generate" showTechnical={showTechnical} />
        <div className="mt-5 flex justify-end">
          <a href="#map" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#f3a177] px-5 text-sm font-semibold text-[#181026] transition hover:bg-[#f3a177]/85">
            Завърши: виж цялата карта<ArrowDown className="size-4" aria-hidden="true" />
          </a>
        </div>
        </section>
      )}
    </div>
  );
}

function TrainingDatasetIntro({ showTechnical, onPractice }: { showTechnical: boolean; onPractice: () => void }) {
  return (
    <section className="mb-5 overflow-hidden rounded-[24px] border border-[#72d7af]/20 bg-[#72d7af]/[0.045]">
      <div className="grid gap-6 p-5 lg:grid-cols-[0.72fr_1.28fr] lg:p-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#72d7af]">
            Преди AI да може да генерира
          </p>
          <h3 className="mt-3 text-2xl font-semibold leading-tight">
            Обучението започва с много двойки: картинка + описание
          </h3>
          <p className="mt-3 text-sm leading-6 text-white/55">
            Един пример съдържа файл с картинка и отделен текст за нея. Програмата ги зарежда заедно и ги превръща в числа — AI не гледа екран като човек.
          </p>
          {showTechnical && (
            <div className="mt-4 rounded-xl border border-[#72d7af]/15 bg-[#0d0e20] p-4 text-xs leading-5 text-white/45">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#72d7af]">
                реален пример за мащаб
              </p>
              <p className="mt-2">
                LAION-5B е публикуван набор от 5,85 млрд. филтрирани двойки „изображение + текст“. Това не означава, че всеки генератор използва всички тях или точно този набор.
              </p>
              <a
                href="https://arxiv.org/abs/2210.08402"
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-[#72d7af] underline decoration-[#72d7af]/30 underline-offset-4 hover:text-white"
              >
                Виж изследването за LAION-5B
              </a>
            </div>
          )}
        </div>

        <TrainingExampleCards />
      </div>

      <TrainingPairExplorer caption={PROMPT} showTechnical={showTechnical} onPractice={onPractice} />

      <div className="border-t border-[#f3a177]/15 bg-[#f3a177]/[0.04] px-5 py-4 text-xs leading-5 text-white/55">
        <strong className="text-[#f3a177]">Важно:</strong>{' '}
        Един пример не е достатъчен. Разнообразието и качеството на огромната библиотека определят какви връзки може да научи AI.
      </div>
    </section>
  );
}

function TrainingSpatialImage({
  values,
  imageOpacity,
  overlayOpacity,
  label,
}: {
  values?: number[];
  imageOpacity: number;
  overlayOpacity: number;
  label: string;
}) {
  return (
    <div
      role="img"
      aria-label={`${label}. Решетка ${GRID_SIZE} на ${GRID_SIZE} върху примерната сцена.`}
      className="relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-[#0d0e20]"
    >
      <img
        src="/fox-moon.webp"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 size-full object-cover transition-opacity duration-300"
        style={{ opacity: imageOpacity }}
      />
      <div
        className="absolute inset-0 grid"
        style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, minmax(0, 1fr))` }}
        aria-hidden="true"
      >
        {Array.from({ length: CELL_COUNT }, (_, index) => (
          <span
            key={index}
            className={`relative border-b border-r border-white/20 ${
              index === SELECTED_CELL ? 'z-10 ring-2 ring-inset ring-white' : ''
            }`}
          >
            {values && (
              <span
                className="absolute inset-0 transition-opacity duration-300"
                style={{ backgroundColor: latentColor(values[index]), opacity: overlayOpacity }}
              />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

function NoiseAmountControl({ step, onChange }: { step: number; onChange: (step: number) => void }) {
  const percent = Math.round(step / TOTAL_STEPS * 100);
  return (
    <label className="mt-4 block rounded-xl border border-[#72d7af]/20 bg-[#72d7af]/[0.04] px-3 pt-3">
      <span className="flex items-center justify-between gap-3 text-xs font-semibold">
        <span>Колко шум добавяме?</span><span aria-hidden="true" className="font-mono text-[#72d7af]">{percent}%</span>
      </span>
      <input type="range" min={0} max={TOTAL_STEPS} step={1} value={step} onChange={(event) => onChange(Number(event.target.value))} aria-label="Количество добавен шум" aria-valuetext={`${percent}% добавен шум`} className="block h-11 w-full cursor-pointer accent-[#72d7af] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#72d7af]" />
    </label>
  );
}

function TrainingVisualBridge({
  state,
  showTechnical,
  onNoiseChange,
}: {
  state: TrainingState;
  showTechnical: boolean;
  onNoiseChange: (step: number) => void;
}) {
  const noisePercent = Math.round(state.timestep / 10);
  const noisyImageOpacity = Math.max(0.06, 0.55 * (1 - state.sigma));

  const stages = [
    {
      eyebrow: '01 · ИЗХОДНИЯТ ПРИМЕР',
      title: 'Истинската картинка',
      technical: 'pixel image x',
      description: 'Слагаме решетка само за да проследим едни и същи пространствени области.',
      values: undefined,
      imageOpacity: 1,
      overlayOpacity: 0,
    },
    {
      eyebrow: '02 · СВИВАМЕ Я',
      title: 'Същата сцена като числа',
      technical: 'clean latent z₀',
      description: 'Луната остава горе, а лисицата долу, но подробностите вече са кодирани в по-малко числа.',
      values: state.clean,
      imageOpacity: 0.48,
      overlayOpacity: 0.62,
    },
    {
      eyebrow: '03 · ДОБАВЯМЕ ШУМ',
      title: noisePercent === 0 ? 'Още няма добавен шум' : `${noisePercent}% добавен шум`,
      technical: 'noisy latent zₜ',
      description: 'Шумът променя числата във всички клетки. При повече шум първоначалната структура става все по-трудна за разпознаване.',
      values: state.noisy,
      imageOpacity: noisyImageOpacity,
      overlayOpacity: 0.76,
    },
  ];

  return (
    <section className="mb-5 rounded-[24px] border border-[#f3a177]/18 bg-[#f3a177]/[0.035] p-4 sm:p-5">
      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_0.8fr] lg:items-end">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f3a177]">
            Една и съща област през цялото упражнение
          </p>
          <h3 className="mt-2 text-2xl font-semibold">Как картинката се пренася в числовата решетка?</h3>
        </div>
        <p className="text-sm leading-6 text-white/50">
          Белият квадрат отбелязва приблизително една и съща област и в трите изгледа. Промени шума с плъзгача под третата картинка.
        </p>
      </div>

      <div className="grid items-stretch gap-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {stages.map((stage, index) => (
          <div key={stage.eyebrow} className="contents">
            <article className="rounded-[22px] border border-white/10 bg-[#0d0e20] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#f3a177]">
                {stage.eyebrow}
              </p>
              <h4 className="mt-2 text-base font-semibold">{stage.title}</h4>
              {showTechnical && (
                <p className="mt-1 font-mono text-[10px] text-[#afa3d9]">техническо име: {stage.technical}</p>
              )}
              <p className="mb-4 mt-2 min-h-14 text-xs leading-5 text-white/45">{stage.description}</p>
              <TrainingSpatialImage
                values={stage.values}
                imageOpacity={stage.imageOpacity}
                overlayOpacity={stage.overlayOpacity}
                label={stage.title}
              />
              {index === 2 && <NoiseAmountControl step={noisePercent / 5} onChange={onNoiseChange} />}
            </article>
            {index < stages.length - 1 && (
              <FlowArrow label={index === 0 ? 'свиваме' : '+ известен шум'} />
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl border border-white/8 bg-white/[0.025] p-4 text-sm leading-6 text-white/50 md:grid-cols-[1fr_1fr]">
        <p>
          <strong className="text-white/80">Какво означава белият квадрат?</strong>{' '}
          В тази сцена той е около главата на лисицата. В числовата карта обаче не съдържа „малка глава“, а няколко числа, които работят със съседните клетки.
        </p>
        <p>
          <strong className="text-white/80">Какво остава известно?</strong>{' '}
          Ние пазим оригиналната картинка и точния шум, който сме добавили. Затова можем да проверим колко добре AI е познал шума.
        </p>
      </div>
    </section>
  );
}

function TrainingLab({ seed, showTechnical, onFinish }: { seed: number; showTechnical: boolean; onFinish: () => void }) {
  const [step, setStep] = useState(10);
  const [chapter, setChapter] = useState<'examples' | 'noise' | 'practice'>('examples');
  const practiceTab = useRef<HTMLButtonElement>(null);
  const state = useMemo(() => buildTrainingState(step, seed), [seed, step]);
  const cleanValue = state.clean[SELECTED_CELL];
  const noiseValue = state.noise[SELECTED_CELL];
  const noisyValue = state.noisy[SELECTED_CELL];

  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-[#9ee3c8]">
        Обучение · стъпка {chapter === 'examples' ? 1 : chapter === 'noise' ? 2 : 3} от 3
      </p>
      <div className="mb-6 grid grid-cols-3 gap-1 rounded-2xl border border-white/8 bg-[#0d0e20] p-1.5" role="tablist" aria-label="Части на упражнението за обучение">
        {([
          ['examples', '1. Примери'],
          ['noise', '2. Добавяме шум'],
          ['practice', '3. Опит и проверка'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            ref={key === 'practice' ? practiceTab : undefined}
            type="button"
            onClick={() => setChapter(key)}
            id={`training-tab-${key}`}
            role="tab"
            aria-selected={chapter === key}
            aria-controls={`training-panel-${key}`}
            tabIndex={chapter === key ? 0 : -1}
            onKeyDown={moveBetweenTabs}
            className={`rounded-xl px-2 py-3 text-xs font-semibold transition sm:text-sm ${
              chapter === key ? 'bg-[#72d7af] text-[#10251d]' : 'text-white/45 hover:bg-white/5 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {chapter === 'examples' && <section id="training-panel-examples" role="tabpanel" aria-labelledby="training-tab-examples"><TrainingDatasetIntro showTechnical={showTechnical} onPractice={() => {
        setChapter('noise');
      }} /></section>}
      {chapter === 'noise' && <section id="training-panel-noise" role="tabpanel" aria-labelledby="training-tab-noise">
        <TrainingVisualBridge state={state} showTechnical={showTechnical} onNoiseChange={setStep} />
        <div className="mt-5 flex justify-end">
          <Button onClick={() => { setChapter('practice'); practiceTab.current?.focus({ preventScroll: true }); }} className="min-h-11 rounded-full bg-[#9ee3c8] px-5 text-[#10251d] hover:bg-[#b5efd8]">
            Продължи: опит и проверка<ArrowRight data-icon="inline-end" />
          </Button>
        </div>
      </section>}

      {chapter === 'practice' && (
        <section id="training-panel-practice" role="tabpanel" aria-labelledby="training-tab-practice">
      <div className="mb-5 grid gap-3 rounded-2xl border border-white/10 bg-[#0d0e20] p-4 lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="flex items-center gap-4">
          <img
            src="/fox-moon.webp"
            alt="Учебният пример: лисица под луната"
            className="size-16 rounded-xl object-cover"
          />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/35">
              Учебен пример
            </p>
            <p className="mt-1 text-sm font-semibold">Същият файл: fox-moon.webp</p>
            <p className="mt-1 text-xs text-white/40">„{PROMPT}“</p>
            <p className="mt-2 text-xs leading-5 text-white/60">Задачата е да се предвиди добавеният шум. С плъзгача под шумната скица променяш трудността, не броя научени примери.</p>
            {showTechnical && (
              <p className="mt-1 font-mono text-[10px] text-[#afa3d9]">VAE encoder → clean latent z₀</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs text-white/45">
          <span className="rounded-lg bg-white/5 px-3 py-2">добавен шум: {Math.round(state.timestep / 10)}%</span>
          <span className="rounded-lg bg-white/5 px-3 py-2">знаем точния шум</span>
        </div>
      </div>

      <div className="grid items-stretch gap-2 lg:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <Panel
          eyebrow="01 · подготвяме примера"
          title="Скрита скица на истинската картинка"
          technicalName="clean latent z₀"
          showTechnical={showTechnical}
          description="Първо свиваме истинската картинка до по-малка таблица от числа."
          values={state.clean}
          selected
        />
        <FlowArrow label="+ шум, който знаем" />
        <Panel
          eyebrow="02 · затрудняваме задачата"
          title="Същата скица с добавен шум"
          technicalName="шумен latent zₜ"
          showTechnical={showTechnical}
          description="Ние сами добавяме случаен шум. Понеже знаем точно какво сме добавили, после можем да проверим отговора."
          values={state.noisy}
          selected
        >
          <NoiseAmountControl step={step} onChange={setStep} />
        </Panel>
        <FlowArrow label="AI опитва" />
        <Panel
          eyebrow="03 · отговорът на AI"
          title="Шумът, който AI е познал"
          technicalName="предвиден шум ε̂θ"
          showTechnical={showTechnical}
          description="AI посочва кои промени според него са били добавеният шум."
          values={state.predictedNoise}
          selected
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[22px] border border-white/10 bg-[#0d0e20] p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#afa3d9]">
            Как сме добавили шума · квадратче [6,5]
          </p>
          <p className="mt-2 text-sm text-white/50">Запазваме част от оригиналното число и добавяме част от случайния шум.</p>
          {showTechnical && <p className="mt-2 font-mono text-xs text-[#afa3d9]">zₜ = αₜ · z₀ + σₜ · ε</p>}
          <div className="mt-5 flex flex-wrap items-center gap-2 font-mono text-sm sm:text-base">
            <span className="rounded-lg bg-white/5 px-3 py-2">
              {state.alpha.toFixed(2)} × {number(cleanValue)}
            </span>
            <span className="text-white/30">+</span>
            <span className="rounded-lg bg-[#f08b5d]/10 px-3 py-2 text-[#f3a177]">
              {state.sigma.toFixed(2)} × {number(noiseValue)}
            </span>
            <Equal className="size-4 text-white/30" aria-hidden="true" />
            <span className="rounded-lg bg-[#afa3d9]/10 px-3 py-2 text-[#c9bdf1]">
              {number(noisyValue)}
            </span>
          </div>
        </div>

        <div className="rounded-[22px] border border-[#72d7af]/20 bg-[#72d7af]/[0.055] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#72d7af]">
                04 · проверяваме отговора
              </p>
              <p className="mt-2 text-base font-semibold">Колко е сбъркал AI?</p>
              {showTechnical && <p className="mt-1 font-mono text-[10px] text-[#72d7af]">loss = (ε̂θ − ε)²</p>}
            </div>
            <span className="font-mono text-lg text-[#72d7af]">{state.loss.toFixed(4)}</span>
          </div>
          <p className="mt-3 text-xs leading-5 text-white/45">
            Измерваме разликата между истинския шум и отговора. После леко коригираме AI, за да се справи по-добре следващия път.
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs text-[#72d7af]">
            <RefreshCw className="size-4" aria-hidden="true" />
            научените настройки се коригират
          </div>
        </div>
      </div>
      <WeightsExplainer mode="train" showTechnical={showTechnical} />
      <div className="mt-5 rounded-2xl border border-[#f3a177]/20 bg-[#f3a177]/[0.045] p-4 sm:flex sm:items-center sm:justify-between sm:gap-5">
        <div>
          <p className="font-semibold text-white">Обучението е завършено</p>
          <p className="mt-1 text-sm leading-6 text-white/60">Вече знаеш как AI опитва, сравнява отговора и поправя научените настройки.</p>
        </div>
        <button type="button" onClick={onFinish} className="mt-4 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full bg-[#f3a177] px-5 text-sm font-semibold text-[#181026] transition hover:bg-[#f3a177]/85 sm:mt-0">
          Следва: генериране<ArrowRight className="size-4" aria-hidden="true" />
        </button>
      </div>
        </section>
      )}
    </div>
  );
}

function DiffusionLab() {
  const [mode, setMode] = useState<Mode>('train');
  const seed = 4459;
  const [showTechnical, setShowTechnical] = useState(false);

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
  }

  return (
    <div id="lab" className="scroll-mt-6">
      <div className="mb-7 sm:mb-10">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-white/35">
            Двете половини на процеса
          </p>
          <p className="hidden text-xs text-white/30 sm:block">Избери откъде да започнеш</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:gap-3" aria-label="Избери процес">
          <div className="relative pb-7 sm:pb-9">
            <button
              type="button"
              onClick={() => changeMode('train')}
              aria-pressed={mode === 'train'}
              className={`group relative h-full w-full overflow-hidden rounded-[20px] border p-3 text-left transition sm:rounded-[22px] sm:p-5 ${
                mode === 'train'
                  ? 'border-[#72d7af]/55 bg-[#72d7af]/[0.1] shadow-[0_14px_45px_rgba(114,215,175,0.1)]'
                  : 'border-white/10 bg-white/[0.025] hover:border-[#72d7af]/25 hover:bg-[#72d7af]/[0.04]'
              }`}
            >
            <span className="flex items-center gap-3 sm:gap-4">
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-xl transition sm:size-11 sm:rounded-2xl ${
                  mode === 'train'
                    ? 'bg-[#72d7af] text-[#10251d]'
                    : 'bg-white/5 text-[#72d7af] group-hover:bg-[#72d7af]/10'
                }`}
              >
                <BrainCircuit className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white sm:text-lg">Обучение</span>
                <span className="mt-1 hidden text-xs leading-5 text-white/55 sm:block">
                  Как AI дава отговор, проверяваме го и го поправяме
                </span>
              </span>
            </span>
            {mode === 'train' && (
              <span className="absolute right-4 top-4 hidden rounded-full bg-[#72d7af]/15 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#72d7af] sm:inline">
                активно
              </span>
            )}
            </button>
            <span
              aria-hidden="true"
              className={`absolute bottom-0 left-1/2 flex -translate-x-1/2 flex-col items-center transition ${
                mode === 'train' ? 'text-[#72d7af]' : 'text-white/15'
              }`}
            >
              <span className="h-3 w-px bg-current" />
              <span className="grid size-6 place-items-center rounded-full border border-current bg-[#111225]">
                <ArrowDown className="size-3" />
              </span>
            </span>
          </div>
          <div className="relative pb-7 sm:pb-9">
            <button
              type="button"
              onClick={() => changeMode('generate')}
              aria-pressed={mode === 'generate'}
              className={`group relative h-full w-full overflow-hidden rounded-[20px] border p-3 text-left transition sm:rounded-[22px] sm:p-5 ${
                mode === 'generate'
                  ? 'border-[#f3a177]/55 bg-[#f3a177]/[0.11] shadow-[0_14px_45px_rgba(240,139,93,0.12)]'
                  : 'border-white/10 bg-white/[0.025] hover:border-[#f3a177]/25 hover:bg-[#f3a177]/[0.045]'
              }`}
            >
            <span className="flex items-center gap-3 sm:gap-4">
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-xl transition sm:size-11 sm:rounded-2xl ${
                  mode === 'generate'
                    ? 'bg-[#f3a177] text-[#181026]'
                    : 'bg-white/5 text-[#f3a177] group-hover:bg-[#f3a177]/10'
                }`}
              >
                <Sparkles className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-white sm:text-lg">Генериране</span>
                <span className="mt-1 hidden text-xs leading-5 text-white/55 sm:block">
                  Как от случаен шум се появява нова картинка
                </span>
              </span>
            </span>
            {mode === 'generate' && (
              <span className="absolute right-4 top-4 hidden rounded-full bg-[#f3a177]/15 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#f3a177] sm:inline">
                активно
              </span>
            )}
            </button>
            <span
              aria-hidden="true"
              className={`absolute bottom-0 left-1/2 flex -translate-x-1/2 flex-col items-center transition ${
                mode === 'generate' ? 'text-[#f3a177]' : 'text-white/15'
              }`}
            >
              <span className="h-3 w-px bg-current" />
              <span className="grid size-6 place-items-center rounded-full border border-current bg-[#111225]">
                <ArrowDown className="size-3" />
              </span>
            </span>
          </div>
        </div>
      </div>

      <section className="rounded-[32px] border border-white/10 bg-[#15162d]/90 p-4 shadow-[0_40px_130px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:p-6 lg:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-full border border-[#72d7af]/20 bg-[#72d7af]/[0.06] px-3 py-1.5 text-xs text-[#72d7af]">
            {mode === 'generate' ? 'AI вече е обучен' : 'Обучение = опит, проверка, поправка'}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <ExplanationDialog label="Какво е шум?" title="Шумът е таблица от случайни числа">
              <p>Когато покажем тези числа като цветове, те изглеждат като разноцветни зрънца без нарисуван предмет.</p>
              <p><strong className="text-white">При обучението</strong> ние добавяме известен шум към истинска картинка. Понеже знаем какво сме добавили, можем да проверим дали AI го е познал.</p>
              <p><strong className="text-white">При генерирането</strong> AI тръгва от шум и използва наученото, за да прави много малки поправки към подредена сцена.</p>
            </ExplanationDialog>
            <button
              type="button"
              onClick={() => setShowTechnical((current) => !current)}
              aria-pressed={showTechnical}
              className="min-h-9 rounded-full border border-white/10 px-3 text-xs text-white/65 transition hover:border-white/20 hover:text-white aria-pressed:border-[#afa3d9]/30 aria-pressed:bg-[#afa3d9]/10 aria-pressed:text-[#c9bdf1]"
            >
              {showTechnical ? 'Скрий техническите имена' : 'Покажи техническите имена'}
            </button>
          </div>
          {showTechnical && <span className="font-mono text-xs text-white/50">начален вариант #{seed}</span>}
        </div>

      {mode === 'generate' ? (
        <GenerationLab seed={seed} showTechnical={showTechnical} />
      ) : (
        <TrainingLab seed={seed} showTechnical={showTechnical} onFinish={() => changeMode('generate')} />
      )}

      <details className="mt-6 rounded-2xl border border-white/8 bg-white/[0.025] px-4 py-3 text-sm text-white/55">
        <summary className="cursor-pointer font-semibold text-white/70">За точността на учебния модел</summary>
        <p className="mt-3 max-w-4xl leading-6">
          Числата и цветните таблици са опростена визуализация. Редът на действията е като при истинските модели, но тук не зареждаме огромен обучен AI.
        </p>
      </details>
      </section>
    </div>
  );
}

export default function Home() {
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
          <a className="transition hover:text-foreground" href="#lab">Лаборатория</a>
          <a className="transition hover:text-foreground" href="#map">Картата</a>
          <a className="transition hover:text-foreground" href="#why-noise">Какво е шум и защо?</a>
        </nav>
        <details className="group relative sm:hidden">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-white/12 px-3 text-xs font-semibold text-white/75 marker:content-none">
            Раздели<ChevronDown className="size-4 transition group-open:rotate-180" aria-hidden="true" />
          </summary>
          <nav className="absolute right-0 top-12 z-40 grid min-w-56 gap-1 rounded-2xl border border-white/12 bg-[#15162d] p-2 text-sm shadow-2xl" aria-label="Мобилна навигация">
            <a className="rounded-xl px-3 py-3 text-white/75 hover:bg-white/8 hover:text-white" href="#lab">Упражнението</a>
            <a className="rounded-xl px-3 py-3 text-white/75 hover:bg-white/8 hover:text-white" href="#map">Цялата карта</a>
            <a className="rounded-xl px-3 py-3 text-white/75 hover:bg-white/8 hover:text-white" href="#why-noise">Какво е шум и защо?</a>
          </nav>
        </details>
        <span className="hidden rounded-full border border-white/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-white/55 md:inline">
          Experiment 01
        </span>
      </header>

      <section id="top" className="relative mx-auto w-full max-w-[1440px] px-5 pb-24 pt-7 sm:px-8 lg:px-12 lg:pb-32 lg:pt-10">
        <div className="pointer-events-none absolute -left-48 top-0 h-[520px] w-[520px] rounded-full bg-[#613b8f]/15 blur-[110px]" />
        <div className="relative z-10 mb-10 flex flex-col gap-5 lg:mb-12 lg:flex-row lg:items-end lg:justify-between lg:gap-10">
          <div className="max-w-3xl">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#f3a177]">
              <Sparkles className="size-4" aria-hidden="true" />
              Интерактивно обяснение
            </p>
            <h1 className="text-balance text-[clamp(2.5rem,4.5vw,4rem)] font-medium leading-[1.08] tracking-[-0.045em]">
              Как AI прави <span className="text-[#afa3d9]">картинки</span>
            </h1>
            <p className="mt-4 text-pretty text-base leading-7 text-white/70 sm:text-lg">
              Виж как AI се учи от картинки с описания и как после превръща случаен шум в нова сцена — не наведнъж, а с много малки поправки.
            </p>
            <ol className="mt-5 flex flex-wrap items-center gap-2 text-xs font-semibold text-white/65" aria-label="Маршрут на урока">
              <li className="rounded-full border border-[#72d7af]/25 bg-[#72d7af]/[0.06] px-3 py-2 text-[#9ee3c8]">1. Обучение</li>
              <li aria-hidden="true" className="text-white/30">→</li>
              <li className="rounded-full border border-[#f3a177]/25 bg-[#f3a177]/[0.05] px-3 py-2 text-[#f3a177]">2. Генериране</li>
              <li aria-hidden="true" className="text-white/30">→</li>
              <li className="rounded-full border border-white/10 px-3 py-2">3. Обобщение</li>
            </ol>
          </div>
            <a
              href="#lab"
              className="inline-flex h-11 shrink-0 items-center gap-2 self-start rounded-full bg-[#f08b5d] px-5 text-sm font-semibold text-[#181026] transition hover:bg-[#f6a07b] lg:self-auto"
            >
              Започни с обучението
              <ArrowDown className="size-4" aria-hidden="true" />
            </a>
        </div>

        <DiffusionLab />
      </section>

      <section id="map" className="border-y border-white/8 bg-[#0d0e20]">
        <div className="mx-auto w-full max-w-[1280px] px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f3a177]">Цялата карта</p>
            <h2 className="mt-5 text-balance text-4xl font-medium leading-tight tracking-[-0.04em] sm:text-6xl">
              Обучението и генерирането не са една анимация наобратно.
            </h2>
          </div>

          <div className="mt-16 grid gap-5 lg:grid-cols-2">
            <article className="rounded-[28px] border border-white/10 bg-white/[0.035] p-7">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-[#72d7af]">TRAINING</span>
                <RefreshCw className="size-5 text-[#72d7af]" aria-hidden="true" />
              </div>
              <h3 className="mt-8 text-2xl font-semibold">Моделът се учи да предвижда</h3>
              <LearningCycleIllustrations mode="train" />
              <p className="mt-5 text-sm leading-6 text-white/55">
                Сравняваме опита с точния отговор и леко поправяме научените връзки. После упражнението започва отново с друг пример.
              </p>
            </article>

            <article className="rounded-[28px] border border-white/10 bg-white/[0.035] p-7">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-[#f3a177]">GENERATION</span>
                <LockKeyhole className="size-5 text-[#f3a177]" aria-hidden="true" />
              </div>
              <h3 className="mt-8 text-2xl font-semibold">Наученият модел вече не се променя</h3>
              <LearningCycleIllustrations mode="generate" />
              <p className="mt-5 text-sm leading-6 text-white/55">
                Моделът използва наученото, за да намалява шума. Думите насочват всяка следваща промяна, но не посочват готови части за поставяне.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section id="why-noise" className="mx-auto grid w-full max-w-[1280px] gap-16 px-5 py-24 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:px-12 lg:py-32">
        <WhatIsNoise />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f3a177]">А защо използваме шум?</p>
          <h2 className="mt-5 text-4xl font-medium leading-tight tracking-[-0.04em] sm:text-5xl">
            За да превърнем създаването в задача с проверим отговор.
          </h2>
        </div>
        <div className="divide-y divide-white/10 border-y border-white/10">
          {[
            {
              icon: Sigma,
              title: 'При обучението знаем отговора',
              text: 'Ние сами добавяме случаен шум. Затова знаем верния отговор и можем точно да измерим дали AI го е познал.',
            },
            {
              icon: Waves,
              title: 'При генерацията шумът носи вариантите',
              text: 'Различната начална таблица със случайни числа води до различна композиция и различен краен резултат.',
            },
            {
              icon: BrainCircuit,
              title: 'Трудният скок става серия от малки задачи',
              text: 'Моделът не създава милиони пиксели наведнъж. Той многократно оценява следващата полезна промяна.',
            },
          ].map((item, index) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="grid gap-4 py-8 sm:grid-cols-[54px_210px_1fr] sm:items-start">
                <span className="flex items-center gap-2 font-mono text-xs text-white/30">
                  <Icon className="size-4 text-[#afa3d9]" aria-hidden="true" />
                  0{index + 1}
                </span>
                <h3 className="text-lg font-semibold">{item.title}</h3>
                <p className="max-w-xl text-base leading-7 text-muted-foreground">{item.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-white/8 bg-[#0d0e20]">
        <div className="mx-auto w-full max-w-[1280px] px-5 py-24 sm:px-8 lg:px-12 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8ed3ba]">Откъде идва идеята?</p>
              <h2 className="mt-5 text-4xl font-medium leading-tight tracking-[-0.04em] sm:text-5xl">
                Не един изобретател. Три важни стъпки.
              </h2>
              <p className="mt-6 max-w-lg text-lg leading-8 text-muted-foreground">
                Учените заемат идея от физиката: както капка мастило бавно се разпръсква във вода, подредбата може постепенно да изчезне. Ако AI научи обратната посока, може да я възстановява стъпка по стъпка.
              </p>

              <div className="mt-10 rounded-[28px] border border-white/10 bg-[#131426] p-5">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-white/35">Основната идея</p>
                <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
                  <div className="rounded-2xl border border-[#f3a177]/25 bg-[#f3a177]/8 px-3 py-5">
                    <Sparkles className="mx-auto size-5 text-[#f3a177]" aria-hidden="true" />
                    <p className="mt-3 text-sm font-semibold">подредена картина</p>
                  </div>
                  <div className="flex flex-col items-center gap-1 text-white/30">
                    <ArrowRight className="size-5" aria-hidden="true" />
                    <span className="font-mono text-[9px] uppercase">шум</span>
                  </div>
                  <div className="rounded-2xl border border-[#afa3d9]/25 bg-[#afa3d9]/8 px-3 py-5">
                    <Waves className="mx-auto size-5 text-[#afa3d9]" aria-hidden="true" />
                    <p className="mt-3 text-sm font-semibold">случайни числа</p>
                  </div>
                </div>
                <div className="mt-4 border-t border-white/8 pt-4 text-sm leading-6 text-white/45">
                  <p><span className="font-semibold text-white/65">Защо точно случаен шум?</span> След достатъчно малки добавки различните картинки стигат до един и същ прост вид позната „мъгла“ от случайни числа.</p>
                  <p className="mt-2">Обучението показва пътя надясно. Моделът се учи да върви наляво.</p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute bottom-8 left-[3.25rem] top-8 hidden w-px bg-white/10 sm:block" aria-hidden="true" />
              {[
                {
                  year: '2015',
                  title: 'Идеята става генеративен модел',
                  people: 'Jascha Sohl-Dickstein и екип',
                  text: 'Те описват как структурата се разрушава бавно чрез дифузия и как един модел може да научи обратния процес.',
                  href: 'https://arxiv.org/abs/1503.03585',
                },
                {
                  year: '2020',
                  title: 'Методът започва да прави убедителни картинки',
                  people: 'Jonathan Ho, Ajay Jain и Pieter Abbeel',
                  text: 'DDPM показва практичен начин моделът да се обучава да предвижда добавения шум и да го премахва стъпка по стъпка.',
                  href: 'https://arxiv.org/abs/2006.11239',
                },
                {
                  year: '2022',
                  title: 'Процесът става по-ефективен и може да следва текст',
                  people: 'Robin Rombach и екип',
                  text: 'Latent Diffusion премества работата в по-малко числово пространство и добавя начин думите да насочват изображението.',
                  href: 'https://arxiv.org/abs/2112.10752',
                },
              ].map((item, index) => (
                <article key={item.year} className="relative grid gap-4 border-t border-white/10 py-8 first:border-t-0 sm:grid-cols-[106px_1fr] sm:gap-7">
                  <div className="relative z-10 flex items-center gap-3 sm:block">
                    <span className="inline-flex rounded-full border border-white/10 bg-[#0d0e20] px-3 py-1.5 font-mono text-xs text-[#f3a177]">
                      {item.year}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/25 sm:mt-3 sm:block">
                      стъпка 0{index + 1}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold leading-7">{item.title}</h3>
                    <p className="mt-2 text-sm font-medium text-[#8ed3ba]">{item.people}</p>
                    <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">{item.text}</p>
                    <a className="mt-4 inline-flex items-center gap-2 text-sm text-white/50 transition hover:text-white" href={item.href} target="_blank" rel="noreferrer">
                      Оригиналната публикация
                      <ArrowRight className="size-3.5" aria-hidden="true" />
                    </a>
                  </div>
                </article>
              ))}
              <p className="border-t border-white/10 pt-6 text-sm leading-6 text-white/35">
                Това е съкратена учебна история. Методът има и други паралелни линии на развитие, но тези три публикации показват основния път до техниката в нашия пример.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/8 bg-[#0d0e20]">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-5 py-10 text-sm text-white/40 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-12">
          <p>Учебен модел с реална последователност на операциите.</p>
          <div className="flex flex-wrap gap-5">
            <a className="transition hover:text-white" href="https://arxiv.org/abs/1503.03585" target="_blank" rel="noreferrer">
              Diffusion · 2015
            </a>
            <a className="transition hover:text-white" href="https://arxiv.org/abs/2006.11239" target="_blank" rel="noreferrer">
              DDPM · 2020
            </a>
            <a className="transition hover:text-white" href="https://arxiv.org/abs/2112.10752" target="_blank" rel="noreferrer">
              Latent Diffusion · 2022
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
