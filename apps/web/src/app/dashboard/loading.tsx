/** Пока сервер собирает список досок — скелетон с сиреневым переливом */
export default function DashboardLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-accent/40">
      <div className="glass flex h-14 items-center border-x-0 border-t-0 px-4 sm:px-6">
        <div className="skeleton size-8 rounded-[10px]" />
        <div className="skeleton ml-2.5 h-4 w-20 rounded-full" />
      </div>
      <div className="space-y-6 p-4 sm:p-8 md:pl-[17rem]">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-10 w-full max-w-xl rounded-xl" />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <li
              key={i}
              className="overflow-hidden rounded-2xl border bg-card"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="skeleton aspect-[16/10]" style={{ animationDelay: `${i * 80}ms` }} />
              <div className="space-y-2 p-3">
                <div className="skeleton h-4 w-2/3 rounded-full" />
                <div className="skeleton h-3 w-1/2 rounded-full" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
