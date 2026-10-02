import { OFFER_DISCOUNT_PERCENT, OFFER_PRICE, ORIGINAL_PRICE } from '@/lib/pricing'

type OfferCtaLabelProps = {
  arrow?: boolean
  prefix?: 'now' | 'for'
}

export default function OfferCtaLabel({ arrow = false, prefix = 'now' }: OfferCtaLabelProps) {
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 leading-none">
      <span>{prefix === 'for' ? 'Subscribe Now for' : 'Subscribe Now'}</span>
      <span className="text-black/65 line-through decoration-black/65 decoration-2">{ORIGINAL_PRICE}</span>
      <span className="font-black">{OFFER_PRICE}</span>
      <span className="rounded-full bg-black/12 px-1.5 py-0.5 text-[10px] font-black tracking-[0.08em]">
        {OFFER_DISCOUNT_PERCENT}% OFF
      </span>
      {arrow ? <span aria-hidden="true">→</span> : null}
    </span>
  )
}
