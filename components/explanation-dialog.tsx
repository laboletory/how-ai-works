'use client';

import { CircleHelp, X } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function ExplanationDialog({
  label,
  title,
  children,
  accent = 'peach',
}: {
  label: string;
  title: string;
  children: ReactNode;
  accent?: 'peach' | 'mint';
}) {
  const color = accent === 'mint' ? '#9ee3c8' : '#f3a177';

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.035] px-3 text-xs font-semibold text-white/75 transition hover:border-white/25 hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ outlineColor: color }}
          />
        }
      >
        <CircleHelp className="size-4" style={{ color }} aria-hidden="true" />
        {label}
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="max-h-[min(620px,calc(100vh-2rem))] max-w-lg overflow-y-auto rounded-[24px] border border-white/12 bg-[#15162d] p-5 text-white shadow-2xl sm:p-6"
      >
        <DialogHeader className="pr-10">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color }}>
            Бързо обяснение
          </p>
          <DialogTitle className="text-xl font-semibold leading-snug">{title}</DialogTitle>
        </DialogHeader>
        <DialogDescription render={<div />} className="space-y-3 text-sm leading-6 text-white/70">
          {children}
        </DialogDescription>
        <DialogClose
          render={
            <button
              type="button"
              aria-label="Затвори обяснението"
              className="absolute right-4 top-4 grid size-9 place-items-center rounded-full border border-white/10 text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ outlineColor: color }}
            />
          }
        >
          <X className="size-4" aria-hidden="true" />
          <span className="sr-only">Затвори обяснението</span>
        </DialogClose>
        <DialogClose
          render={
            <button
              type="button"
              aria-label="Затвори и продължи"
              className="mt-2 min-h-11 justify-self-start rounded-full px-5 text-sm font-semibold text-[#181026] transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ backgroundColor: color, outlineColor: color }}
            />
          }
        >
          Разбрах
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
