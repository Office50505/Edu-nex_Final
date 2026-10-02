import { SKILLOMATE_CHECKOUT_URL } from '@/lib/links'

export type CourseStatus = 'published' | 'upcoming' | 'draft'

export interface Course {
  slug: string
  title: string
  description: string
  status: CourseStatus
  href: string
  language: string
  access: string
  thumbnail?: string
  lessons?: number
}

export const COURSES: Course[] = [
  {
    slug: 'ai-influencer-creation',
    title: 'AI Influencer Creation',
    description:
      'Learn techniques for creating an AI character, keeping its appearance consistent, exploring different outfits and locations, and turning images into videos using AI tools.',
    status: 'published',
    href: SKILLOMATE_CHECKOUT_URL,
    language: 'Hindi + English',
    access: 'Mobile & web',
  },
]

export const publishedCourses = COURSES.filter((course) => course.status === 'published')
export const upcomingCourses = COURSES.filter((course) => course.status === 'upcoming')
