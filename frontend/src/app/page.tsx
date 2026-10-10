import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-neutral-200">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <Link
            aria-label="Andhrímnir home"
            className="rounded-sm text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-neutral-700 focus-visible:ring-offset-4"
            href="/"
          >
            Andhrímnir
          </Link>
          <span className="text-sm text-neutral-600">Application foundation</span>
        </div>
      </header>

      <main className="flex flex-1 items-center px-6 py-16" id="main-content">
        <section
          aria-labelledby="page-title"
          className="mx-auto w-full max-w-3xl rounded-xl border border-neutral-200 p-8 sm:p-12"
        >
          <p className="mb-3 text-sm font-medium text-neutral-600">
            Restaurant operations platform
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" id="page-title">
            The foundation is in place.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-neutral-700">
            This is the initial Andhrímnir application shell. Product workflows will be added in
            subsequent implementation stories.
          </p>
          <div
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-neutral-200 px-3 py-1.5 text-sm text-neutral-700"
            role="status"
          >
            <span aria-hidden="true" className="size-2 rounded-full bg-neutral-500" />
            Setup in progress
          </div>
        </section>
      </main>
    </div>
  );
}
