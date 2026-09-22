export const DEFAULT_OFFER_VIDEO_URL = "/assets/skillomate-offer-preview.mp4";

const DEFAULT_OFFER_POSTER_URL = "https://d5yxyknp74yz8.cloudfront.net/courses/ai-influencer/lessons/lesson-01.webp";

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
          videoUrl: `/assets/offers/offer-${String(offerNumber).padStart(2, "0")}.mp4`,
          posterUrl: DEFAULT_OFFER_POSTER_URL,
        },
      ];
    }),
  ),
});

export function offerMediaForPage(pageKey) {
  return OFFER_MEDIA[pageKey] || OFFER_MEDIA["offer.html"];
}
