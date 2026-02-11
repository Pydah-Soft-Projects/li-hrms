'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export default function ExportAttendanceDialog({
  open,
  onClose,
  divisions: divisionsProp,
  departments: departmentsProp,
  onExport,
  exporting = false,
}) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [designationId, setDesignationId] = useState('');
  const [designations, setDesignations] = useState([]);
  const [divisions, setDivisions] = useState(divisionsProp || []);
  const [departments, setDepartments] = useState(departmentsProp || []);

  useEffect(() => {
    if (open) {
      api.getDivisions(true).then((res) => {
        setDivisions(res?.data || divisionsProp || []);
      }).catch(() => setDivisions(divisionsProp || []));
      api.getDepartments(true).then((res) => {
        setDepartments(res?.data || departmentsProp || []);
      }).catch(() => setDepartments(departmentsProp || []));
    }
  }, [open, divisionsProp, departmentsProp]);

  useEffect(() => {
    if (departmentId) {
      api.getDesignations(departmentId).then((res) => {
        setDesignations(res?.data || []);
      }).catch(() => setDesignations([]));
    } else {
      setDesignations([]);
      setDesignationId('');
    }
  }, [departmentId]);

  useEffect(() => {
    if (!divisionId) {
      setDepartmentId('');
      setDesignationId('');
    }
  }, [divisionId]);

  const handleClose = () => {
    setStartDate('');
    setEndDate('');
    setDivisionId('');
    setDepartmentId('');
    setDesignationId('');
    onClose();
  };

  const handleExport = () => {
    if (!startDate || !endDate) return;
    if (new Date(startDate) > new Date(endDate)) return;
    onExport({
      startDate,
      endDate,
      divisionId: divisionId || undefined,
      departmentId: departmentId || undefined,
      designationId: designationId || undefined,
    });
  };

  const filteredDepartments = divisionId
    ? departments.filter((d) => {
        const deptDivId = d.division && typeof d.division === 'object' ? d.division._id : d.division;
        if (deptDivId === divisionId) return true;
        if (Array.isArray(d.divisions) && d.divisions.length > 0) {
          return d.divisions.some((div) => {
            const divId = div && typeof div === 'object' ? div._id : div;
            return divId === divisionId;
          });
        }
        return false;
      })
    : departments;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Export Attendance</h3>
          <button
            onClick={handleClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="export-start-date" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Start Date
            </label>
            <input
              id="export-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label htmlFor="export-end-date" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              End Date
            </label>
            <input
              id="export-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div>
            <label htmlFor="export-division" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Division
            </label>
            <select
              id="export-division"
              value={divisionId}
              onChange={(e) => {
                setDivisionId(e.target.value);
                setDepartmentId('');
                setDesignationId('');
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="">All Divisions</option>
              {divisions.map((div) => (
                <option key={div._id} value={div._id}>{div.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="export-department" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Department
            </label>
            <select
              id="export-department"
              value={departmentId}
              onChange={(e) => {
                setDepartmentId(e.target.value);
                setDesignationId('');
              }}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="">All Departments</option>
              {filteredDepartments.map((dept) => (
                <option key={dept._id} value={dept._id}>{dept.name}</option>
              ))}
            </select>
          </div>

          {departmentId && (
            <div>
              <label htmlFor="export-designation" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Section / Designation
              </label>
              <select
                id="export-designation"
                value={designationId}
                onChange={(e) => setDesignationId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              >
                <option value="">All Designations</option>
                {designations.map((d) => (
                  <option key={d._id} value={d._id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleExport}
              disabled={!startDate || !endDate || exporting || new Date(startDate) > new Date(endDate)}
              className="flex-1 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-green-500/30 transition-all hover:from-green-600 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Export'}
            </button>
            <button
              onClick={handleClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
