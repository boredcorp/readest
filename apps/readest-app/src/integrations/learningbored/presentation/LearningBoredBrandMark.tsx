import Image from 'next/image';

interface LearningBoredBrandMarkProps {
  className?: string;
}

export default function LearningBoredBrandMark({ className }: LearningBoredBrandMarkProps) {
  return (
    <Image
      alt=''
      aria-hidden='true'
      className={className}
      draggable={false}
      height={64}
      src='/learningbored/mark.svg'
      unoptimized
      width={64}
    />
  );
}
