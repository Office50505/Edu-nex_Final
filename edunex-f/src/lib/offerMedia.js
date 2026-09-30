export const DEFAULT_OFFER_VIDEO_URL = "/assets/offer-video/Video-65454.mp4";

const DEFAULT_OFFER_POSTER_URL = "https://d5yxyknp74yz8.cloudfront.net/courses/ai-influencer/lessons/lesson-01.webp";

const UPLOADED_OFFER_VIDEO_URLS = Object.freeze({
  2: "/assets/offer-video/Video-65454.mp4",
  3: "/assets/offer-video/offer-3.mov",
  4: "/assets/offer-video/offer-4.mov",
});

export const OFFER_MEDIA = Object.freeze({
  "offer.html": {
    videoUrl: DEFAULT_OFFER_VIDEO_URL,
    posterUrl: DEFAULT_OFFER_POSTER_URL,
  },
  ...Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => {
      const offerNumber = index + 2;
      return [
        `offer${offerNumber}.html`,
        {
          videoUrl: UPLOADED_OFFER_VIDEO_URLS[offerNumber]
            || `/assets/offers/offer-${String(offerNumber).padStart(2, "0")}.mp4`,
          posterUrl: DEFAULT_OFFER_POSTER_URL,
        },
      ];
    }),
  ),
});

export function offerMediaForPage(pageKey) {
  return OFFER_MEDIA[pageKey] || OFFER_MEDIA["offer.html"];
}
