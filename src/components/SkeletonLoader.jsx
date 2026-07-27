import React from 'react';

export function CardSkeleton({ count = 4, height = 'h-48' }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col justify-between ${height}`}>
          <div className="w-full h-24 bg-gray-200 rounded-lg mb-3" />
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-200 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex items-center justify-between">
          <div className="space-y-2 flex-1">
            <div className="h-3 bg-gray-200 rounded w-1/2" />
            <div className="h-6 bg-gray-200 rounded w-1/4" />
          </div>
          <div className="w-11 h-11 bg-gray-200 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <div className="h-5 bg-gray-200 rounded w-1/4" />
        <div className="h-8 bg-gray-200 rounded w-1/6" />
      </div>
      <div className="p-4 space-y-4">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center justify-between gap-4 py-2 border-b border-gray-50">
            {Array.from({ length: cols }).map((_, c) => (
              <div key={c} className="h-4 bg-gray-200 rounded flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="p-6 space-y-6">
      <StatsSkeleton count={4} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <TableSkeleton rows={4} cols={4} />
        </div>
        <div className="space-y-4">
          <CardSkeleton count={2} height="h-36" />
        </div>
      </div>
    </div>
  );
}

export default PageSkeleton;
