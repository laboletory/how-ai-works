import Image from 'next/image';

const EXAMPLES = [
  { name: 'plant', description: 'Зелено растение в саксия.' },
  { name: 'boat', description: 'Лодка с бяло платно.' },
  { name: 'mountain', description: 'Планина със снежен връх.' },
];

export function TrainingExampleCards() {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-[#0d0e20] p-4 sm:p-5">
      <div className="mb-5 flex items-center gap-3">
        <Image
          src="/illustrations/fox-training-example-gouache.webp"
          alt="Лисичката — нашият рисуван водач"
          width={80}
          height={80}
          unoptimized
          className="size-16 shrink-0 rounded-full sm:size-20"
        />
        <p className="max-w-xs text-sm font-medium leading-6 text-white/80">
          Виж картинката. Прочети описанието ѝ.
        </p>
      </div>
      <ul aria-label="Три примера: картинка и отделно описание" className="grid gap-3 sm:grid-cols-3">
        {EXAMPLES.map(({ name, description }) => (
          <li key={name} className="min-w-0">
            <figure className="grid h-full grid-cols-[96px_1fr] overflow-hidden rounded-xl border border-white/10 bg-white/[0.025] sm:flex sm:flex-col">
              <Image
                src={`/illustrations/training-pair-${name}-gouache.webp`}
                alt={description}
                width={640}
                height={640}
                unoptimized
                className="aspect-square w-full self-center object-cover"
              />
              <figcaption className="flex flex-col justify-center border-l border-white/10 p-3 sm:flex-1 sm:justify-start sm:border-l-0 sm:border-t">
                <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[#8ed3ba]">Описание</span>
                <p className="mt-1.5 text-sm font-semibold leading-5 text-white/90">{description}</p>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </div>
  );
}
