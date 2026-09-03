type Scene = {
  label: string;
  description: string;
  src: string;
  width: number;
  height: number;
  viewBox: string;
};

const TRAINING: Scene[] = [
  {
    label: 'пример',
    description: 'Рисувана лисица с лилаво шалче разглежда картинка с място за описание.',
    src: '/illustrations/fox-training-example-gouache.webp',
    width: 1254,
    height: 1254,
    viewBox: '95 65 1060 1120',
  },
  ...[
    ['известен шум', 'Лисицата добавя шум към учебния пример.', 'training-noise'],
    ['AI познава', 'Лисицата изследва шума и предлага отговор.', 'training-predict'],
    ['корекция', 'Лисицата коригира научените връзки.', 'training-correct'],
  ].map(([label, description, asset]) => ({
    label, description, viewBox: '75 60 1100 1140', src: `/illustrations/fox-${asset}-gouache.webp`, width: 1254, height: 1254,
  })),
];

const GENERATION: Scene[] = [
  ['случаен шум', 'Лисицата започва с решетка от случаен шум.', 'generation-noise'],
  ['промптът насочва', 'Промптът е показан с балонче, а картата все още съдържа шум.', 'generation-prompt'],
  ['малки стъпки', 'Три карти показват как сцената постепенно се избистря.', 'generation-steps'],
  ['готов образ', 'Лисицата показва готовата картина под луната.', 'generation-result'],
].map(([label, description, asset]) => ({
  label, description, viewBox: '75 60 1100 1140', src: `/illustrations/fox-${asset}-gouache.webp`, width: 1254, height: 1254,
}));

export function LearningCycleIllustrations({ mode }: { mode: 'train' | 'generate' }) {
  const scenes = mode === 'train' ? TRAINING : GENERATION;
  const accent = mode === 'train' ? 'text-[#72d7af]' : 'text-[#f3a177]';

  return (
    <ol aria-label={mode === 'train' ? 'Четири стъпки на обучението' : 'Четири стъпки на генерирането'} className="mt-7 grid grid-cols-2 gap-x-3 gap-y-6 min-[480px]:grid-cols-4">
      {scenes.map((scene, index) => (
        <li key={scene.label} className="w-full max-w-40 justify-self-center text-center">
          <figure>
            {/* Frame each painted vignette without modifying the original artwork. */}
            <svg viewBox={scene.viewBox} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false" className="aspect-square w-full overflow-hidden rounded-full">
              <image href={scene.src} width={scene.width} height={scene.height} />
            </svg>
            <figcaption className="mt-3 text-xs leading-5 text-white/65">
              <span className={`block font-mono text-[10px] ${accent}`}>0{index + 1}</span>
              {scene.label}
              <span className="sr-only">. {scene.description}</span>
            </figcaption>
          </figure>
        </li>
      ))}
    </ol>
  );
}
