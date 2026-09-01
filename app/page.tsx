'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  BrainCircuit,
  CircleDot,
  Equal,
  LockKeyhole,
  Minus,
  Pause,
  Play,
  RefreshCw,
  Sigma,
  Sparkles,
  StepForward,
  Waves,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

const TOTAL_STEPS = 20;
const GRID_SIZE = 12;
const CELL_COUNT = GRID_SIZE * GRID_SIZE;
const SELECTED_CELL = 77;
const PROMPT = 'малка червена лисица под голяма луна';

type Mode = 'generate' | 'train';
type ConceptKey = 'moon' | 'fox' | 'under' | 'ground';

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
    <div className="flex items-center justify-center gap-2 py-1 text-white/25 xl:flex-col xl:px-1 xl:py-0">
      <ArrowDown className="size-4 xl:hidden" aria-hidden="true" />
      <ArrowRight className="hidden size-4 xl:block" aria-hidden="true" />
      <span className="font-mono text-[9px] uppercase tracking-[0.12em] xl:[writing-mode:vertical-rl]">
        {label}
      </span>
    </div>
  );
}

function PromptStrip({ timestep, showTechnical }: { timestep: number; showTechnical: boolean }) {
  return (
    <div className="mb-5 grid gap-3 rounded-2xl border border-white/10 bg-[#0d0e20] p-4 lg:grid-cols-[1fr_auto] lg:items-center">
      <div>
        <p className="mb-1 text-sm font-semibold text-white">
          Изречението се превежда на числа, които AI може да използва
        </p>
        <p className="mb-3 text-xs leading-5 text-white/40">
          Думите не са готови картинки. Те са подсказки, които насочват всяка следваща промяна.
        </p>
        {showTechnical && (
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#afa3d9]">
            техническо име: text encoder → embedding c
          </p>
        )}
        <div className="flex flex-wrap gap-1.5" aria-label={`Prompt: ${PROMPT}`}>
          {PROMPT.split(' ').map((token, index) => (
            <span
              key={`${token}-${index}`}
              className={`rounded-md px-2 py-1 text-xs ${
                ['червена', 'лисица', 'луна'].includes(token)
                  ? 'bg-[#f08b5d]/15 text-[#f3a177]'
                  : 'bg-white/5 text-white/55'
              }`}
            >
              {token}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 font-mono text-xs text-white/45">
        <span className="rounded-lg bg-white/5 px-3 py-2">оставащ шум: {Math.round(timestep / 10)}%</span>
        {showTechnical && <span className="rounded-lg bg-white/5 px-3 py-2">t={timestep} · 12×12×4</span>}
      </div>
    </div>
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

function GenerationLab({ step, seed, showTechnical }: { step: number; seed: number; showTechnical: boolean }) {
  const [chapter, setChapter] = useState<'words' | 'step' | 'detail'>('words');
  const state = useMemo(() => buildGenerationState(step, seed), [seed, step]);
  const currentValue = state.current[SELECTED_CELL];
  const predictedValue = state.predictedNoise[SELECTED_CELL];
  const nextValue = state.next[SELECTED_CELL];

  return (
    <div>
      <div className="mb-6 grid grid-cols-3 gap-1 rounded-2xl border border-white/8 bg-[#0d0e20] p-1.5" aria-label="Части на упражнението за генериране">
        {([
          ['words', '1. Думите'],
          ['step', '2. Една стъпка'],
          ['detail', '3. Под микроскоп'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setChapter(key)}
            aria-pressed={chapter === key}
            className={`rounded-xl px-2 py-3 text-xs font-semibold transition sm:text-sm ${
              chapter === key ? 'bg-[#f3a177] text-[#181026]' : 'text-white/45 hover:bg-white/5 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {chapter === 'words' && (
        <>
          <PromptStrip timestep={state.timestep} showTechnical={showTechnical} />
          <ConceptInfluenceExplorer seed={seed} showTechnical={showTechnical} />
        </>
      )}

      {chapter === 'step' && (
        <div>
          <p className="mb-4 max-w-3xl text-sm leading-6 text-white/55">
            AI гледа цялата числова скица, предлага малка промяна навсякъде и прилага само част от нея.
          </p>
          <div className="grid items-stretch gap-2 xl:grid-cols-[1fr_auto_1fr_auto_1fr]">
            <Panel eyebrow="01 · вход" title="Сегашната скрита скица" technicalName="текущ latent zₜ" showTechnical={showTechnical} description="Числовото състояние, което AI вижда в момента." values={state.current} selected />
            <FlowArrow label="AI предлага" />
            <Panel eyebrow="02 · предложение" title="Малката промяна" technicalName="предвиден шум ε̂θ" showTechnical={showTechnical} description="Предложение какво леко да се промени във всички области." values={state.predictedNoise} selected />
            <FlowArrow label="прилагаме част" />
            <Panel eyebrow="03 · резултат" title="Обновената скица" technicalName="следващ latent zₜ₋₁" showTechnical={showTechnical} description="Това отново е описание на цялата сцена, не отделен обект." values={state.next} selected />
          </div>
        </div>
      )}

      {chapter === 'detail' && (
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
            {step === TOTAL_STEPS ? (
              <div className="grid h-full min-h-48 grid-cols-[0.9fr_1.1fr]">
                <img src="/fox-moon.webp" alt="Примерен декодиран резултат: червена лисица под луната" className="h-full min-h-48 w-full object-cover" />
                <div className="flex flex-col justify-center p-5">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#f3a177]">04 · истински пиксели</p>
                  <p className="mt-2 text-base font-semibold">Скрита скица → картинка</p>
                  {showTechnical && <p className="mt-1 font-mono text-[10px] text-[#afa3d9]">техническо име: VAE decoder</p>}
                  <p className="mt-2 text-xs leading-5 text-white/55">Накрая всички скрити числа заедно се превеждат в ръбове, цветове, козина, луна и терен.</p>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-48 items-center gap-4 p-5">
                <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/5 text-[#afa3d9]"><LockKeyhole className="size-5" aria-hidden="true" /></div>
                <div>
                  <p className="text-sm font-semibold">Картинката се отключва накрая</p>
                  <p className="mt-1 text-xs leading-5 text-white/55">Завърши стъпките, за да видиш крайния превод.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TrainingDatasetIntro({ showTechnical }: { showTechnical: boolean }) {
  return (
    <section className="mb-5 overflow-hidden rounded-[24px] border border-[#72d7af]/20 bg-[#72d7af]/[0.045]">
      <div className="grid gap-6 p-5 lg:grid-cols-[0.72fr_1.28fr] lg:p-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#72d7af]">
            Преди първото упражнение · откъде започва всичко
          </p>
          <h3 className="mt-3 text-2xl font-semibold leading-tight">
            Не милиони лисици. Огромна библиотека от различни картинки и текстове.
          </h3>
          <p className="mt-3 text-sm leading-6 text-white/55">
            Картинките идват с придружаващ текст. От много различни примери AI търси повтарящи се връзки, а после се упражнява с шум.
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

        <figure className="overflow-hidden rounded-2xl border border-white/10 bg-[#0d0e20]">
          <img
            src="/fox-learning-triptych.webp"
            alt="Три илюстрации: лисица разглежда библиотека от картинки, намира връзки между тях и се упражнява да разпознава шум"
            className="aspect-[2/1] w-full object-cover"
          />
          <figcaption className="grid grid-cols-3 border-t border-white/8 text-center">
            <div className="px-2 py-3 sm:px-4">
              <p className="font-mono text-[9px] text-[#72d7af]">01</p>
              <p className="mt-1 text-xs font-semibold">Много примери</p>
            </div>
            <div className="border-x border-white/8 px-2 py-3 sm:px-4">
              <p className="font-mono text-[9px] text-[#72d7af]">02</p>
              <p className="mt-1 text-xs font-semibold">Открива връзки</p>
            </div>
            <div className="px-2 py-3 sm:px-4">
              <p className="font-mono text-[9px] text-[#72d7af]">03</p>
              <p className="mt-1 text-xs font-semibold">Упражнява се</p>
            </div>
          </figcaption>
        </figure>
      </div>

      <div className="border-t border-[#f3a177]/15 bg-[#f3a177]/[0.04] px-5 py-4 text-xs leading-5 text-white/45">
        <strong className="text-[#f3a177]">Важно:</strong>{' '}
        AI търси закономерности, а не изрязва части от албум. Качеството и разнообразието на примерите имат значение.
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

function TrainingVisualBridge({
  state,
  showTechnical,
}: {
  state: TrainingState;
  showTechnical: boolean;
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
          Белият квадрат отбелязва приблизително една и съща област и в трите изгледа. Премести плъзгача за шум отдолу и наблюдавай третата карта.
        </p>
      </div>

      <div className="grid items-stretch gap-2 xl:grid-cols-[1fr_auto_1fr_auto_1fr]">
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

function TrainingLab({ step, seed, showTechnical }: { step: number; seed: number; showTechnical: boolean }) {
  const [chapter, setChapter] = useState<'examples' | 'noise' | 'practice'>('examples');
  const state = useMemo(() => buildTrainingState(step, seed), [seed, step]);
  const cleanValue = state.clean[SELECTED_CELL];
  const noiseValue = state.noise[SELECTED_CELL];
  const noisyValue = state.noisy[SELECTED_CELL];

  return (
    <div>
      <div className="mb-6 grid grid-cols-3 gap-1 rounded-2xl border border-white/8 bg-[#0d0e20] p-1.5" aria-label="Части на упражнението за обучение">
        {([
          ['examples', '1. Примери'],
          ['noise', '2. Добавяме шум'],
          ['practice', '3. AI се упражнява'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setChapter(key)}
            aria-pressed={chapter === key}
            className={`rounded-xl px-2 py-3 text-xs font-semibold transition sm:text-sm ${
              chapter === key ? 'bg-[#72d7af] text-[#10251d]' : 'text-white/45 hover:bg-white/5 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {chapter === 'examples' && <TrainingDatasetIntro showTechnical={showTechnical} />}
      {chapter === 'noise' && <TrainingVisualBridge state={state} showTechnical={showTechnical} />}

      {chapter === 'practice' && (
        <>
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
            <p className="mt-1 text-sm font-semibold">Истинска картинка + нейното описание</p>
            <p className="mt-1 text-xs text-white/40">„{PROMPT}“</p>
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

      <div className="grid items-stretch gap-2 xl:grid-cols-[1fr_auto_1fr_auto_1fr]">
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
        />
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
        </>
      )}
    </div>
  );
}

function DiffusionLab() {
  const [mode, setMode] = useState<Mode>('generate');
  const [step, setStep] = useState(0);
  const [seed, setSeed] = useState(4459);
  const [playing, setPlaying] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);

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
    }, 620);
    return () => window.clearInterval(timer);
  }, [playing]);

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setStep(0);
    setPlaying(false);
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

  function nextStep() {
    setPlaying(false);
    setStep((current) => Math.min(TOTAL_STEPS, current + 1));
  }

  const timestep =
    mode === 'generate'
      ? Math.round((1 - step / TOTAL_STEPS) * 1000)
      : Math.round((step / TOTAL_STEPS) * 1000);

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
              onClick={() => changeMode('generate')}
              aria-pressed={mode === 'generate'}
              className={`group relative h-full w-full overflow-hidden rounded-[20px] border p-3 text-left transition sm:rounded-[22px] sm:p-5 ${
                mode === 'generate'
                  ? 'border-[#f3a177]/55 bg-[#f3a177]/[0.11] shadow-[0_14px_45px_rgba(240,139,93,0.12)]'
                  : 'border-white/10 bg-white/[0.025] hover:border-[#f3a177]/25 hover:bg-[#f3a177]/[0.045]'
              }`}
            >
            <span
              className={`absolute inset-x-0 top-0 h-0.5 transition ${
                mode === 'generate' ? 'bg-[#f3a177]' : 'bg-transparent'
              }`}
            />
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
            <span
              className={`absolute inset-x-0 top-0 h-0.5 transition ${
                mode === 'train' ? 'bg-[#72d7af]' : 'bg-transparent'
              }`}
            />
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
                  Как AI се упражнява и се научава да премахва шум
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
        </div>
      </div>

      <section className="rounded-[32px] border border-white/10 bg-[#15162d]/90 p-4 shadow-[0_40px_130px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:p-6 lg:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-full border border-[#72d7af]/20 bg-[#72d7af]/[0.06] px-3 py-1.5 text-xs text-[#72d7af]">
            {mode === 'generate' ? 'AI вече е обучен' : 'AI се упражнява и се поправя'}
          </span>
          <button
            type="button"
            onClick={() => setShowTechnical((current) => !current)}
            aria-pressed={showTechnical}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-white/55 transition hover:border-white/20 hover:text-white aria-pressed:border-[#afa3d9]/30 aria-pressed:bg-[#afa3d9]/10 aria-pressed:text-[#c9bdf1]"
          >
            {showTechnical ? 'Скрий техническите имена' : 'Покажи техническите имена'}
          </button>
          {showTechnical && <span className="font-mono text-xs text-white/50">начален вариант #{seed}</span>}
        </div>

      {mode === 'generate' ? (
        <GenerationLab step={step} seed={seed} showTechnical={showTechnical} />
      ) : (
        <TrainingLab step={step} seed={seed} showTechnical={showTechnical} />
      )}

      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">
              {mode === 'generate' ? 'Създаване стъпка по стъпка' : 'Упражнение с добавяне на шум'}
            </p>
            <p className="mt-1 text-xs text-white/40">
              {mode === 'generate'
                ? `Стъпка ${step} от ${TOTAL_STEPS} · шумът постепенно намалява`
                : `Ниво на шум ${step} от ${TOTAL_STEPS} · задачата става по-трудна`}
            </p>
          </div>
          <span className="font-mono text-sm text-[#f3a177]">
            {mode === 'generate' ? `${Math.round(timestep / 10)}% шум остава` : `${Math.round(timestep / 10)}% шум добавен`}
          </span>
        </div>

        <Slider
          aria-label={mode === 'generate' ? 'Стъпка на генерирането' : 'Ниво на шум при обучението'}
          min={0}
          max={TOTAL_STEPS}
          step={1}
          value={[step]}
          onValueChange={(value) => {
            setStep(typeof value === 'number' ? value : (value[0] ?? 0));
            setPlaying(false);
          }}
          className="[&_[data-slot=slider-range]]:bg-[#f08b5d] [&_[data-slot=slider-thumb]]:size-4 [&_[data-slot=slider-thumb]]:border-[#f08b5d] [&_[data-slot=slider-thumb]]:bg-white [&_[data-slot=slider-track]]:h-1.5 [&_[data-slot=slider-track]]:bg-white/10"
        />

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button
            onClick={togglePlayback}
            className="h-10 rounded-full bg-white px-4 text-[#11122a] hover:bg-white/85"
          >
            {playing ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
            {playing ? 'Пауза' : step === TOTAL_STEPS ? 'Отначало' : 'Пусни'}
          </Button>
          <Button
            variant="outline"
            onClick={nextStep}
            disabled={step >= TOTAL_STEPS}
            className="h-10 rounded-full border-white/10 bg-white/[0.035] px-4 text-white hover:bg-white/10"
          >
            <StepForward data-icon="inline-start" />
            Една стъпка
          </Button>
          <Button
            variant="outline"
            onClick={chooseNewSeed}
            className="h-10 rounded-full border-white/10 bg-white/[0.035] px-4 text-white hover:bg-white/10"
          >
            <RefreshCw data-icon="inline-start" />
            Друг начален шум
          </Button>
        </div>
      </div>

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
          <a className="transition hover:text-foreground" href="#why-noise">Защо шум?</a>
        </nav>
        <span className="rounded-full border border-white/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-white/45">
          Experiment 01
        </span>
      </header>

      <section id="top" className="relative mx-auto w-full max-w-[1440px] px-5 pb-24 pt-12 sm:px-8 lg:px-12 lg:pb-32 lg:pt-16">
        <div className="pointer-events-none absolute -left-48 top-0 h-[520px] w-[520px] rounded-full bg-[#613b8f]/15 blur-[110px]" />
        <div className="relative z-10 mb-14 grid gap-10 lg:grid-cols-[1fr_0.88fr] lg:items-end">
          <div>
            <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#f3a177]">
              <Sparkles className="size-4" aria-hidden="true" />
              Интерактивно обяснение как AI прави картинки
            </p>
            <h1 className="max-w-4xl text-balance text-[clamp(3rem,7vw,6.6rem)] font-medium leading-[0.92] tracking-[-0.06em]">
              Не картинка.
              <span className="block text-[#afa3d9]">Поредица от числа.</span>
            </h1>
          </div>
          <div className="max-w-2xl lg:justify-self-end">
            <p className="text-pretty text-lg leading-8 text-white/70 sm:text-xl">
              Виж как AI се учи от картинки с описания и как после превръща случаен шум в нова сцена — не наведнъж, а с много малки поправки.
            </p>
            <div className="mt-5 flex items-center gap-3 text-sm text-white/50">
              <span className="text-[#72d7af]">Обучение</span>
              <ArrowRight className="size-4 text-white/20" aria-hidden="true" />
              <span className="text-[#f3a177]">Генериране</span>
            </div>
            <a
              href="#lab"
              className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-[#f08b5d] px-5 text-sm font-semibold text-[#181026] transition hover:bg-[#f6a07b]"
            >
              Започни упражнението
              <ArrowDown className="size-4" aria-hidden="true" />
            </a>
          </div>
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
              <ol className="mt-6 space-y-4 text-sm leading-6 text-white/55">
                <li className="flex gap-3"><span className="font-mono text-white/25">01</span>Свиваме истинска картинка до скрита скица от числа.</li>
                <li className="flex gap-3"><span className="font-mono text-white/25">02</span>Ние сами добавяме точно известен случаен шум.</li>
                <li className="flex gap-3"><span className="font-mono text-white/25">03</span>Показваме шумната скица и текста на AI.</li>
                <li className="flex gap-3"><span className="font-mono text-white/25">04</span>Сравняваме отговора с истинския шум и поправяме AI.</li>
              </ol>
            </article>

            <article className="rounded-[28px] border border-white/10 bg-white/[0.035] p-7">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-[#f3a177]">GENERATION</span>
                <LockKeyhole className="size-5 text-[#f3a177]" aria-hidden="true" />
              </div>
              <h3 className="mt-8 text-2xl font-semibold">Наученият модел вече не се променя</h3>
              <ol className="mt-6 space-y-4 text-sm leading-6 text-white/55">
                <li className="flex gap-3"><span className="font-mono text-white/25">01</span>Започваме от таблица със случайни числа.</li>
                <li className="flex gap-3"><span className="font-mono text-white/25">02</span>Думите се превръщат в числови подсказки.</li>
                <li className="flex gap-3"><span className="font-mono text-white/25">03</span>AI предлага и прилага много малки промени.</li>
                <li className="flex gap-3"><span className="font-mono text-white/25">04</span>Накрая скритата скица се превежда в истински пиксели.</li>
              </ol>
            </article>
          </div>
        </div>
      </section>

      <section id="why-noise" className="mx-auto grid w-full max-w-[1280px] gap-16 px-5 py-24 sm:px-8 lg:grid-cols-[0.72fr_1.28fr] lg:px-12 lg:py-32">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f3a177]">Защо noise?</p>
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

      <footer className="border-t border-white/8 bg-[#0d0e20]">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-5 py-10 text-sm text-white/40 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:px-12">
          <p>Учебен модел с реална последователност на операциите.</p>
          <div className="flex flex-wrap gap-5">
            <a className="transition hover:text-white" href="https://arxiv.org/abs/2006.11239" target="_blank" rel="noreferrer">
              DDPM paper
            </a>
            <a className="transition hover:text-white" href="https://arxiv.org/abs/2112.10752" target="_blank" rel="noreferrer">
              Latent Diffusion paper
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
