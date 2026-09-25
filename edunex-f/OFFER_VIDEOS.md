# Offer page videos

The React offer pages select their preview video from `src/lib/offerMedia.js`.

| Page | Video asset |
| --- | --- |
| `/ai` | `public/assets/offer-video/offer-1.mp4` |
| `/offer2` | `public/assets/offer-video/offer-2.mp4` |
| `/offer3` | `public/assets/offer-video/offer-3.mov` |
| `/offer4` | `public/assets/offer-video/offer-4.mov` |
| `/offer5` | `public/assets/offers/offer-05.mp4` |
| `/offer6` | `public/assets/offers/offer-06.mp4` |
| `/offer7` | `public/assets/offers/offer-07.mp4` |
| `/offer8` | `public/assets/offers/offer-08.mp4` |
| `/offer9` | `public/assets/offers/offer-09.mp4` |
| `/offer10` | `public/assets/offers/offer-10.mp4` |

Upload each file with the exact name shown above. Until an optional page-specific
file is present, that page automatically falls back to
`public/assets/offer-video/offer-1.mp4`.

The main offer URL is `/ai`. Existing `/offer` and `/offer.html` links resolve to `/ai`.
