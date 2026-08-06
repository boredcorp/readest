interface LearningBoredFoldMarkProps {
  className?: string;
}

export default function LearningBoredFoldMark({ className }: LearningBoredFoldMarkProps) {
  return (
    <svg aria-hidden='true' className={className} viewBox='0 0 32 32'>
      <path d='M2.5 7.5 11 3l9 4.5L29.5 3v21.5L21 29l-9-4.5L2.5 29Z' />
      <path d='m11 3 1 21.5M20 7.5 21 29M2.5 7.5 12 12l8-4.5 9.5 4.5' />
    </svg>
  );
}
