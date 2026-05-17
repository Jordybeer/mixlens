export default function AnalysisSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Meta pills skeleton */}
      <div className="flex gap-2">
        {[60, 48, 40].map((w) => (
          <div key={w} className="h-6 rounded-full bg-white/8" style={{ width: w }} />
        ))}
      </div>
      {/* Summary skeleton */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
        <div className="h-3 w-24 rounded bg-white/10" />
        <div className="h-4 w-full rounded bg-white/8" />
        <div className="h-4 w-4/5 rounded bg-white/8" />
        <div className="h-4 w-3/5 rounded bg-white/8" />
      </div>
      {/* Card skeletons */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
          <div className="flex gap-2">
            <div className="h-3 w-10 rounded bg-white/10" />
            <div className="h-3 w-16 rounded bg-white/10" />
          </div>
          <div className="h-3 w-full rounded bg-white/8" />
          <div className="h-4 w-full rounded bg-white/8" />
          <div className="h-4 w-2/3 rounded bg-white/8" />
        </div>
      ))}
    </div>
  )
}
