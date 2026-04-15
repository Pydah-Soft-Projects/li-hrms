'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { motion } from 'framer-motion';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

// Component 1: Attendance Trends (Area Chart)
export const AttendancePulse = ({ data }: { data: any[] }) => {
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1e3a8a" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="colorLeave" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
          <XAxis 
            dataKey="label" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 10, fill: '#6b7280' }}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 10, fill: '#6b7280' }}
          />
          <Tooltip 
            contentStyle={{ 
              borderRadius: '12px', 
              border: 'none', 
              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' 
            }} 
          />
          <Area
            type="monotone"
            dataKey="present"
            stroke="#1e3a8a"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorPresent)"
          />
          <Area
            type="monotone"
            dataKey="leave"
            stroke="#0ea5e9"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorLeave)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

// Component 2: Leave Composition (Pie Chart)
export const LeaveSpectrum = ({ data }: { data: any }) => {
  const chartData = Object.entries(data).map(([name, value]) => ({ name, value }));
  
  return (
    <div className="h-[250px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={5}
            dataKey="value"
          >
            {chartData.map((_entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none' }}
          />
          <Legend iconType="circle" />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

// Component 3: Workforce Heatmap (Department Distribution)
export const WorkforceHeatmap = ({ data }: { data: any[] }) => {
  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f3f4f6" />
          <XAxis type="number" hide />
          <YAxis 
            type="category" 
            dataKey="name" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 11, fill: '#4b5563', fontWeight: 500 }}
            width={100}
          />
          <Tooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '12px', border: 'none' }} />
          <Bar 
            dataKey="count" 
            fill="#6366f1" 
            radius={[0, 4, 4, 0]} 
            barSize={12}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// Premium Card Fragment
export const DashboardCard = ({ title, subtitle, children, icon: Icon, className = "", onClick }: any) => (
  <motion.div 
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    whileHover={onClick ? { y: -4, scale: 1.01 } : { y: -4 }}
    onClick={onClick}
    className={`rounded-3xl border border-white/40 bg-white/60 p-6 shadow-xl backdrop-blur-xl dark:border-zinc-800/50 dark:bg-zinc-900/60 transition-all ${onClick ? 'cursor-pointer hover:shadow-2xl active:scale-95' : ''} ${className}`}
  >
    <div className="mb-6 flex items-center justify-between">
      <div>
        <h3 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">{title}</h3>
        {subtitle && <p className="text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
      </div>
      {Icon && (
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-900/30">
          <Icon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
      )}
    </div>
    {children}
  </motion.div>
);
