import {
  Atom,
  BookOpen,
  BookOpenText,
  Brain,
  Calculator,
  ChartColumn,
  ChartNoAxesCombined,
  CodeXml,
  Cog,
  Dumbbell,
  FlaskConical,
  Globe,
  GraduationCap,
  Landmark,
  Languages,
  Leaf,
  Microscope,
  Mountain,
  Music2,
  Orbit,
  Palette,
  Scale,
  Stethoscope,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

const subjectFamilies: ReadonlyArray<readonly [LucideIcon, ...string[]]> = [
  [Microscope, 'biology', 'life science', 'life sciences'],
  [CodeXml, 'computing', 'computer science', 'information technology', 'ict', 'programming'],
  [Calculator, 'mathematics', 'math', 'general mathematics', 'algebra', 'geometry', 'calculus'],
  [FlaskConical, 'chemistry', 'general chemistry', 'biochemistry'],
  [Atom, 'physics', 'general physics', 'physical science'],
  [Mountain, 'earth science', 'earth and life science', 'geology'],
  [Landmark, 'history', 'philippine history', 'world history', 'kasaysayan'],
  [Globe, 'geography', 'philippine geography', 'world geography'],
  [Languages, 'languages', 'language', 'english', 'filipino', 'linguistics'],
  [BookOpenText, 'literature', 'philippine literature', 'world literature', 'creative writing'],
  [Stethoscope, 'health', 'health science', 'health sciences', 'medicine', 'nursing', 'public health'],
  [ChartNoAxesCombined, 'economics', 'business', 'accounting', 'entrepreneurship', 'finance', 'abm'],
  [Orbit, 'astronomy', 'space science'],
  [Leaf, 'environmental science', 'environmental studies', 'ecology'],
  [Cog, 'engineering', 'technology and livelihood education', 'tle'],
  [ChartColumn, 'statistics', 'statistics and probability', 'data science'],
  [UsersRound, 'social sciences', 'social studies', 'sociology', 'anthropology', 'araling panlipunan', 'humss'],
  [Palette, 'arts', 'art', 'visual arts', 'fine arts', 'design'],
  [Music2, 'music', 'music theory'],
  [GraduationCap, 'education', 'teaching', 'pedagogy'],
  [Scale, 'law and civics', 'law', 'civics', 'political science', 'philippine politics and governance'],
  [Brain, 'psychology', 'personal development'],
  [Dumbbell, 'physical education', 'pe', 'sports science'],
];

const subjectIcons = new Map(
  subjectFamilies.flatMap(([Icon, ...names]) => {
    const icon = <Icon size={20} />;
    return names.map((name) => [name, icon] as const);
  }),
);

export function ReviewerSubjectIcon({ subject }: Readonly<{ subject: string | undefined }>) {
  const key =
    subject
      ?.normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim() ?? '';
  const icon = subjectIcons.get(key) ?? <BookOpen size={20} />;
  return (
    <span aria-hidden="true" className="collection-icon saved-set-icon">
      {icon}
    </span>
  );
}
