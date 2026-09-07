import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar as CalendarIcon,
  Clock,
  Eye,
  Edit2,
  X,
} from 'lucide-react';
import { useContent } from '../context/ContentContext';
import { ContentItem } from '../types/content';
import { StatusBadge } from '../components/common/StatusBadge';
import { PillarBadge } from '../components/common/PillarBadge';
import { FormatBadge } from '../components/common/FormatBadge';
import { formatDateTimeVi, formatTimeOnly } from '../utils/constants';

export const CalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const { contents } = useContent();

  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [selectedEvent, setSelectedEvent] = useState<ContentItem | null>(null);

  // Month navigation
  const prevPeriod = () => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'month') {
        d.setMonth(d.getMonth() - 1);
      } else {
        d.setDate(d.getDate() - 7);
      }
      return d;
    });
  };

  const nextPeriod = () => {
    setCurrentDate(prev => {
      const d = new Date(prev);
      if (viewMode === 'month') {
        d.setMonth(d.getMonth() + 1);
      } else {
        d.setDate(d.getDate() + 7);
      }
      return d;
    });
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Month calendar grid calculations
  const monthData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Monday as start of week (1), Sunday as 7/0
    let startDayOfWeek = firstDayOfMonth.getDay();
    if (startDayOfWeek === 0) startDayOfWeek = 7; // Sunday = 7
    const daysFromPrevMonth = startDayOfWeek - 1;

    const daysInMonth = lastDayOfMonth.getDate();

    const days: { date: Date; isCurrentMonth: boolean; key: string }[] = [];

    // Previous month padding
    const prevMonthLastDate = new Date(year, month, 0).getDate();
    for (let i = daysFromPrevMonth - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDate - i);
      days.push({
        date: d,
        isCurrentMonth: false,
        key: `prev-${d.getTime()}`,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      days.push({
        date: d,
        isCurrentMonth: true,
        key: `curr-${d.getTime()}`,
      });
    }

    // Next month padding to complete full grid (multiple of 7)
    const totalCells = Math.ceil(days.length / 7) * 7;
    const nextMonthDays = totalCells - days.length;
    for (let i = 1; i <= nextMonthDays; i++) {
      const d = new Date(year, month + 1, i);
      days.push({
        date: d,
        isCurrentMonth: false,
        key: `next-${d.getTime()}`,
      });
    }

    return days;
  }, [currentDate]);

  // Week calendar calculation
  const weekData = useMemo(() => {
    const d = new Date(currentDate);
    let day = d.getDay();
    if (day === 0) day = 7; // Monday = 1, Sunday = 7
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day - 1));

    const weekDays: { date: Date; isToday: boolean; key: string }[] = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const curr = new Date(monday);
      curr.setDate(monday.getDate() + i);
      const isToday =
        curr.getDate() === today.getDate() &&
        curr.getMonth() === today.getMonth() &&
        curr.getFullYear() === today.getFullYear();
      weekDays.push({
        date: curr,
        isToday,
        key: `week-${curr.getTime()}`,
      });
    }
    return weekDays;
  }, [currentDate]);

  // Map contents by date string YYYY-MM-DD
  const eventsByDate = useMemo(() => {
    const map = new Map<string, ContentItem[]>();
    contents.forEach(item => {
      const dateStr = item.scheduledAt || item.publishedAt || item.createdAt;
      if (!dateStr) return;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateKey = `${y}-${m}-${day}`;

      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(item);
    });

    // Sort items within each day by time
    map.forEach(list => {
      list.sort((a, b) => {
        const timeA = new Date(a.scheduledAt || a.publishedAt || a.createdAt || '').getTime();
        const timeB = new Date(b.scheduledAt || b.publishedAt || b.createdAt || '').getTime();
        return timeA - timeB;
      });
    });

    return map;
  }, [contents]);

  const getDayKey = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const weekdays = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Lịch nội dung
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Lập kế hoạch xuất bản trực quan theo ngày và tuần
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* View switcher: Month / Week */}
          <div className="bg-white border border-slate-200 rounded-lg p-1 flex items-center shadow-2xs">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewMode === 'month'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tháng
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                viewMode === 'week'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tuần
            </button>
          </div>

          <button
            type="button"
            onClick={() => navigate('/content/new')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Thêm nội dung</span>
          </button>
        </div>
      </div>

      {/* Calendar Controls & Month Title */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={prevPeriod}
              className="p-2 hover:bg-slate-50 text-slate-600 transition-colors"
              aria-label="Kỳ trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={nextPeriod}
              className="p-2 hover:bg-slate-50 text-slate-600 transition-colors border-l border-slate-200"
              aria-label="Kỳ sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 rounded-lg transition-colors cursor-pointer"
          >
            Hôm nay
          </button>
        </div>

        <h3 className="text-base sm:text-lg font-bold text-slate-900 capitalize">
          {viewMode === 'month'
            ? `Tháng ${currentDate.getMonth() + 1} năm ${currentDate.getFullYear()}`
            : `Tuần từ ${weekData[0].date.getDate()}/${weekData[0].date.getMonth() + 1} đến ${weekData[6].date.getDate()}/${weekData[6].date.getMonth() + 1} năm ${weekData[6].date.getFullYear()}`}
        </h3>
      </div>

      {/* MONTH VIEW */}
      {viewMode === 'month' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-bold text-slate-600 py-3">
            {weekdays.map(day => (
              <div key={day}>{day}</div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 divide-x divide-y divide-slate-200">
            {monthData.map(cell => {
              const dateKey = getDayKey(cell.date);
              const items = eventsByDate.get(dateKey) || [];
              const today = isToday(cell.date);

              return (
                <div
                  key={cell.key}
                  className={`min-h-[120px] p-2 flex flex-col transition-colors ${
                    cell.isCurrentMonth ? 'bg-white' : 'bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                        today
                          ? 'bg-blue-600 text-white'
                          : cell.isCurrentMonth
                          ? 'text-slate-800'
                          : 'text-slate-400'
                      }`}
                    >
                      {cell.date.getDate()}
                    </span>

                    {items.length > 0 && (
                      <span className="text-[10px] font-semibold text-slate-400">
                        {items.length} bài
                      </span>
                    )}
                  </div>

                  {/* Scheduled Items for this day */}
                  <div className="space-y-1 overflow-y-auto flex-1 max-h-28">
                    {items.map(item => (
                      <div
                        key={item.id}
                        onClick={() => setSelectedEvent(item)}
                        className="p-1.5 rounded-md border border-slate-200 bg-white hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer group text-left"
                      >
                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                          <span className="font-bold text-slate-700 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5 text-slate-400" />
                            {formatTimeOnly(item.scheduledAt)}
                          </span>
                          <StatusBadge status={item.status} size="sm" showDot={false} />
                        </div>
                        <p className="text-[11px] font-medium text-slate-800 line-clamp-1 group-hover:text-blue-600 transition-colors">
                          {item.title}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* WEEK VIEW */}
      {viewMode === 'week' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="grid grid-cols-7 divide-x divide-slate-200">
            {weekData.map((dayItem, index) => {
              const dateKey = getDayKey(dayItem.date);
              const items = eventsByDate.get(dateKey) || [];

              return (
                <div key={dayItem.key} className="flex flex-col min-h-[500px]">
                  {/* Day Header */}
                  <div
                    className={`p-3 text-center border-b border-slate-200 ${
                      dayItem.isToday ? 'bg-blue-50/70' : 'bg-slate-50'
                    }`}
                  >
                    <p className="text-xs font-semibold text-slate-500">{weekdays[index]}</p>
                    <span
                      className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold mt-1 ${
                        dayItem.isToday ? 'bg-blue-600 text-white' : 'text-slate-800'
                      }`}
                    >
                      {dayItem.date.getDate()}
                    </span>
                  </div>

                  {/* Day events list */}
                  <div className="p-2 space-y-2 flex-1 overflow-y-auto">
                    {items.length === 0 ? (
                      <div className="py-8 text-center text-[11px] text-slate-400">
                        Trống
                      </div>
                    ) : (
                      items.map(item => (
                        <div
                          key={item.id}
                          onClick={() => setSelectedEvent(item)}
                          className="p-2.5 rounded-lg border border-slate-200 bg-white hover:border-blue-400 hover:shadow-xs transition-all cursor-pointer text-left group"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-blue-500" />
                              {formatTimeOnly(item.scheduledAt)}
                            </span>
                            <StatusBadge status={item.status} size="sm" showDot={false} />
                          </div>
                          <h4 className="text-xs font-semibold text-slate-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
                            {item.title}
                          </h4>
                          <div className="mt-1.5 flex items-center gap-1">
                            <PillarBadge pillar={item.pillar} />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedEvent.status} />
                  <FormatBadge format={selectedEvent.format} />
                </div>
                <h3 className="text-base font-bold text-slate-900 pt-1">
                  {selectedEvent.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 space-y-1">
              <p>
                <span className="font-semibold text-slate-900">Lịch đăng:</span>{' '}
                {formatDateTimeVi(selectedEvent.scheduledAt)}
              </p>
              <p>
                <span className="font-semibold text-slate-900">Pillar:</span>{' '}
                {selectedEvent.pillar}
              </p>
              <p>
                <span className="font-semibold text-slate-900">Phụ trách:</span>{' '}
                {selectedEvent.assignee.name}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                Caption
              </p>
              <p className="text-xs text-slate-800 bg-slate-50 p-3 rounded-lg line-clamp-4 leading-relaxed whitespace-pre-wrap">
                {selectedEvent.caption || 'Chưa có caption'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = selectedEvent.id;
                  setSelectedEvent(null);
                  navigate(`/content/edit/${id}`);
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center gap-1.5"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Chỉnh sửa</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
