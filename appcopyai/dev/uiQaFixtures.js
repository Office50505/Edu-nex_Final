const lessonTitles = [
  "Welcome: What an AI Automation Agency Actually Does",
  "Finding Indian SMB Clients Who Need Workflow Automation",
  "Prompt Systems for Client Discovery and Proposal Writing",
  "Building a WhatsApp Lead Capture Workflow with AI Follow-ups",
  "Designing a CRM Handoff Without Custom Backend Work",
  "Pricing Your First Automation Offer",
  "Creating a Client Onboarding Checklist That Reduces Revisions",
  "Using AI to Draft SOPs for Repetitive Business Tasks",
  "Automating Invoice Reminders and Payment Follow-ups",
  "Building a No-Code Support Triage Assistant",
  "Long Lesson Title Stress Test: Mapping Complex Multi-Step AI Workflows Across Sales, Support, Delivery and Reporting",
  "Testing, QA and Handover for Non-Technical Clients",
  "Building Your Portfolio Case Study",
  "Getting Your First Retainer Client",
  "Scaling Delivery with Templates and Reusable Prompts",
];

const buildVideos = () => Array.from({ length: 45 }, (_, index) => ({
  _id: `dev-ui-video-${index + 1}`,
  id: `dev-ui-video-${index + 1}`,
  order: index + 1,
  title: lessonTitles[index % lessonTitles.length],
  description:
    "This development QA lesson fixture is intentionally long enough to test wrapping, video descriptions, lesson AI context and bottom-sheet scrolling without calling the production backend.",
  notes:
    "Key notes:\n- Identify one repetitive business process before suggesting automation.\n- Start with a small workflow that saves time immediately.\n- Package your delivery with SOPs, testing notes and a handover checklist.",
  prompts: [
    "List five repetitive tasks for a small Indian business and rank them by automation impact.",
    "Write a client discovery prompt for understanding sales, support and invoice follow-up workflows.",
    "Create a simple SOP for handing over an AI automation workflow to a non-technical client.",
  ],
  resources: [
    { title: "Lecture prompt worksheet", url: "https://example.com/edunex/lecture-prompt-worksheet" },
  ],
  durationSeconds: 210 + (index % 9) * 45,
  youtubeId: "dQw4w9WgXcQ",
  bunnyGuid: "",
  bunnyLibraryId: "675520",
  completed: index < 12,
  locked: index > 32,
  downloaded: index === 2 || index === 7,
}));

export const DEV_UI_QA_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_EDUNEX_UI_QA_FIXTURES !== "0";

export const UI_QA_COURSES = [
  {
    _id: "dev-ui-course-ai-automation",
    title: "AI Automation Agency Masterclass: Build, Sell & Scale AI Workflows for Businesses",
    instructor: "EduNex Mentor With A Very Long Instructor Name",
    category: "AI Automation",
    description:
      "Learn how to identify business automation opportunities, design practical AI workflows, package your service, price retainers and deliver client-ready systems. This description is deliberately extended for Phase 3 UI QA so Course Details, Curriculum and Lesson Player screens can be stress-tested for wrapping, spacing and scroll reachability.",
    price: 499,
    trialPrice: 1,
    rating: 4.8,
    students: 18420,
    lessonCount: 45,
    certificate: true,
    enrolled: true,
    thumbnailAsset: require("../assets/avatars/a4.jpeg"),
    thumbnailVerticalAsset: require("../assets/avatars/a6.jpeg"),
    notesUrl: "https://example.com/edunex/ai-automation-notes.pdf",
    videos: buildVideos(),
  },
  {
    _id: "dev-ui-course-prompt-engineering",
    title: "Prompt Engineering for Career Growth and Freelance Client Work",
    instructor: "EduNex Mentor",
    category: "AI Skills",
    description: "A practical course for using prompts in real professional workflows.",
    price: 499,
    rating: 4.7,
    thumbnailAsset: require("../assets/avatars/a2.jpeg"),
    thumbnailVerticalAsset: require("../assets/avatars/a8.jpeg"),
    videos: buildVideos().slice(0, 18).map((video, index) => ({ ...video, _id: `dev-prompt-${index + 1}`, order: index + 1 })),
  },
  {
    _id: "dev-ui-course-missing-image",
    title: "Missing Image Course Fixture With A Long Title For Card Stress Testing",
    instructor: "EduNex Mentor",
    category: "Freelancing",
    description: "This course intentionally omits artwork so fallback cards can be tested.",
    price: 499,
    rating: 4.6,
    videos: buildVideos().slice(0, 8).map((video, index) => ({ ...video, _id: `dev-missing-${index + 1}`, order: index + 1 })),
  },
];

export const UI_QA_WISHLIST = UI_QA_COURSES.map(course => course._id);

export const UI_QA_PROGRESS = {
  "dev-ui-course-ai-automation": {
    progressPercent: 60,
    completedVideoIds: buildVideos().slice(0, 12).map(video => video._id),
    videoProgress: { "dev-ui-video-13": { watchedSeconds: 84, duration: 420 } },
    updatedAt: new Date().toISOString(),
  },
  "dev-ui-course-prompt-engineering": {
    progressPercent: 34,
    completedVideoIds: ["dev-prompt-1", "dev-prompt-2", "dev-prompt-3"],
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
  },
};

export const UI_QA_CERTIFICATES = [
  {
    certificateId: "DEV-CERT-EDUNEX-0001",
    courseId: "dev-ui-course-ai-automation",
    courseTitle: "AI Automation Agency Masterclass: Build, Sell & Scale AI Workflows for Businesses",
    userName: "Arslan Ali Mansoori With A Long Certificate Name",
    issuedAt: new Date().toISOString(),
  },
];

export const UI_QA_DOWNLOADS = {
  "00000000-0000-4000-8000-000000000001": {
    status: "done",
    progress: 1,
    bunnyGuid: "00000000-0000-4000-8000-000000000001",
    bunnyLibraryId: "675520",
    videoId: "dev-ui-video-1",
    title: "Completed Download: Welcome to AI Automation Agency Setup",
    courseId: "dev-ui-course-ai-automation",
    courseTitle: "AI Automation Agency Masterclass",
    size: 58720256,
  },
  "00000000-0000-4000-8000-000000000004": {
    status: "downloading",
    progress: 0.5,
    bunnyGuid: "00000000-0000-4000-8000-000000000004",
    bunnyLibraryId: "675520",
    videoId: "dev-ui-video-4",
    title: "Downloading Long Lesson Title For 320 Width Row Stress",
    courseId: "dev-ui-course-ai-automation",
    courseTitle: "AI Automation Agency Masterclass",
    size: 0,
  },
  "00000000-0000-4000-8000-000000000007": {
    status: "error",
    progress: 0,
    bunnyGuid: "00000000-0000-4000-8000-000000000007",
    bunnyLibraryId: "675520",
    videoId: "dev-ui-video-7",
    title: "Failed Download: Client Proposal Automation Workflow",
    courseId: "dev-ui-course-ai-automation",
    courseTitle: "AI Automation Agency Masterclass",
    size: 0,
  },
};

export const UI_QA_AI_MESSAGES = [
  {
    role: "assistant",
    content:
      "## Lesson Summary\n\n- Identify repetitive workflows.\n- Create a small proof-of-value automation.\n- Package the result as a monthly service.\n\nRead more: https://example.com/edunex/automation-guide\n\nInline code: `client_followup_prompt`\n\n```js\nconst workflow = ['lead', 'qualify', 'proposal', 'delivery'];\nconsole.log(workflow.join(' -> '));\n```\n\nLongStringWithoutSpacesToStressMessageWrappingAndCodeHandling123456789012345678901234567890",
  },
];
