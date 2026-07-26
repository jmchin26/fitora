import Link from "next/link";

export function CheckoutUnavailable({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <section
      aria-labelledby="checkout-unavailable-title"
      className="mx-auto max-w-3xl border border-[#a76752] bg-[#f4e5de] p-7 sm:p-10"
    >
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#713f32]">
        Checkout paused
      </p>
      <h1
        className="mt-3 font-serif text-4xl leading-tight tracking-[-0.04em] sm:text-5xl"
        id="checkout-unavailable-title"
      >
        {title}
      </h1>
      <p className="mt-5 max-w-2xl text-[#623c30]">{message}</p>
      <Link
        className="mt-8 inline-flex min-h-12 items-center border border-[#713f32] bg-[#713f32] px-5 py-3 font-bold text-white no-underline hover:bg-transparent hover:text-[#713f32]"
        href="/build"
      >
        Build a fresh outfit
      </Link>
    </section>
  );
}
