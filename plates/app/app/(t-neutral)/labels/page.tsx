// Capture helper: fumadocs-openapi method labels, rendered with the exact classes of its
// MethodLabel/Badge components (packages/shared-api badge.js), in sidebar row style.
const colors: Record<string, string> = {
  GET: 'text-green-600 dark:text-green-400',
  POST: 'text-blue-600 dark:text-blue-400',
  PUT: 'text-yellow-600 dark:text-yellow-400',
  PATCH: 'text-orange-600 dark:text-orange-400',
  DELETE: 'text-red-600 dark:text-red-400',
};

export default function Page() {
  return (
    <main className="flex flex-col gap-6 p-10">
      <div className="flex flex-row items-center gap-8" data-plate="labels">
        {Object.entries(colors).map(([method, color]) => (
          <span key={method} data-method={method} className={`font-mono font-medium ${color} ms-auto text-xs text-nowrap`}>
            {method}
          </span>
        ))}
      </div>
      <div className="flex flex-row items-center gap-8" data-plate="webhook">
        <span className="ms-auto border border-current px-1 rounded-lg text-xs text-nowrap font-mono">Webhook</span>
      </div>
    </main>
  );
}
