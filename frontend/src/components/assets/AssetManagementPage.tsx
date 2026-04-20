'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { auth } from '@/lib/auth';
import { api, type Division } from '@/lib/api';
import { AlertTriangle, Archive, Boxes, CheckCircle2, ClipboardList, PackageCheck } from 'lucide-react';

type AssetScope = 'universal' | 'division';

type DivisionMismatchPayload = {
  message?: string;
  assetName?: string;
  assetDivision?: { name?: string; code?: string };
  employeeDivision?: { name?: string; code?: string };
};

interface AssetRecord {
  _id: string;
  name: string;
  details?: string;
  assetPhotoUrl?: string | null;
  billUrl?: string | null;
  price?: number | null;
  expiryDate?: string | null;
  visibilityScope: AssetScope;
  division_id?: Division | string | null;
  status: 'available' | 'assigned' | 'retired';
  isActive?: boolean;
}

interface EmployeeOption {
  _id: string;
  employee_name: string;
  emp_no: string;
  division_id?: Division | string | null;
  department_id?: { _id: string; name: string } | string | null;
  designation_id?: { _id: string; name: string; code?: string } | string | null;
}

interface AssetAssignmentRecord {
  _id: string;
  asset: AssetRecord;
  employee?: EmployeeOption;
  /** Employee org snapshot on assignment (populated from API). */
  division_id?: Division | string | null;
  department_id?: { _id: string; name: string; code?: string } | string | null;
  designation_id?: { _id: string; name: string; code?: string } | string | null;
  issuedBy?: { name?: string; email?: string; role?: string } | null;
  returnedBy?: { name?: string; email?: string; role?: string } | null;
  assignedAt: string;
  assignmentPhotoUrl?: string | null;
  assignmentSignatureUrl?: string | null;
  expectedReturnDate?: string | null;
  assignmentNotes?: string;
  returnedAt?: string | null;
  returnPhotoUrl?: string | null;
  returnSignatureUrl?: string | null;
  returnNotes?: string;
  status: 'assigned' | 'returned';
}

type AssetFormState = {
  name: string;
  details: string;
  price: string;
  assetPhotoUrl: string;
  billUrl: string;
  expiryDate: string;
  visibilityScope: AssetScope;
  division_id: string;
  status: 'available' | 'assigned' | 'retired';
  isActive: boolean;
};

type AssignFormState = {
  assetIds: string[];
  employeeId: string;
  assignedAt: string;
  assignmentPhotoUrl: string;
  assignmentSignatureUrl: string;
  expectedReturnDate: string;
  assignmentNotes: string;
};

type ReturnFormState = {
  returnedAt: string;
  returnPhotoUrl: string;
  returnSignatureUrl: string;
  returnNotes: string;
};

const emptyAssetForm: AssetFormState = {
  name: '',
  details: '',
  price: '',
  assetPhotoUrl: '',
  billUrl: '',
  expiryDate: '',
  visibilityScope: 'universal' as AssetScope,
  division_id: '',
  status: 'available',
  isActive: true,
};

const emptyAssignForm: AssignFormState = {
  assetIds: [],
  employeeId: '',
  assignedAt: new Date().toISOString().split('T')[0],
  assignmentPhotoUrl: '',
  assignmentSignatureUrl: '',
  expectedReturnDate: '',
  assignmentNotes: '',
};

const emptyReturnForm: ReturnFormState = {
  returnedAt: new Date().toISOString().split('T')[0],
  returnPhotoUrl: '',
  returnSignatureUrl: '',
  returnNotes: '',
};

const searchInputClassName =
  'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950';

function normalizeUrl(res: { url?: string; data?: { url?: string } }) {
  return res?.url || res?.data?.url || '';
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
}

function getDivisionName(division?: Division | string | null) {
  if (!division) return '-';
  return typeof division === 'string' ? division : division.name;
}

function getDepartmentName(dept?: { _id?: string; name?: string; code?: string } | string | null) {
  if (!dept) return '-';
  return typeof dept === 'string' ? dept : dept.name || '-';
}

function getDesignationName(desig?: { _id?: string; name?: string; code?: string } | string | null) {
  if (!desig) return '-';
  return typeof desig === 'string' ? desig : desig.name || '-';
}

function isImageFile(url?: string | null) {
  if (!url) return false;
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url);
}

function Modal({
  open,
  title,
  onClose,
  children,
  stackClassName = 'z-[120]',
  maxWidthClassName = 'max-w-3xl',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  stackClassName?: string;
  maxWidthClassName?: string;
}) {
  if (!open) return null;

  return (
    <div className={`fixed inset-0 ${stackClassName} flex items-center justify-center bg-slate-950/50 p-4`}>
      <div className={`w-full ${maxWidthClassName} rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
          <button type="button" onClick={onClose} className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
            Close
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

function UploadField({
  label,
  value,
  fieldKey,
  uploadingField,
  accept,
  onFileChange,
}: {
  label: string;
  value: string;
  fieldKey: string;
  uploadingField: string | null;
  accept: string;
  onFileChange: (file: File | undefined) => void;
}) {
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [startingCamera, setStartingCamera] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    if (!showCameraModal) {
      stopCamera();
      return;
    }

    let isCancelled = false;
    const startCamera = async () => {
      try {
        setStartingCamera(true);
        setCameraError(null);
        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('Camera is not supported on this device/browser.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (error: unknown) {
        setCameraError(error instanceof Error ? error.message : 'Unable to access camera');
      } finally {
        if (!isCancelled) setStartingCamera(false);
      }
    };

    void startCamera();

    return () => {
      isCancelled = true;
      stopCamera();
    };
  }, [showCameraModal]);

  const captureFromCamera = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      setCameraError('Camera is not ready. Please wait a moment and try again.');
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setCameraError('Failed to capture image from camera.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError('Failed to create captured image.');
          return;
        }
        const capturedFile = new File([blob], `${fieldKey}-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onFileChange(capturedFile);
        setShowCameraModal(false);
      },
      'image/jpeg',
      0.92
    );
  };

  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 transition hover:border-indigo-300 hover:bg-white dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-indigo-800">
        <label className="mb-3 block text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/20">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Choose file</span>
            <span className="mt-1 text-xs text-slate-500">Image or PDF</span>
            <input type="file" accept={accept} onChange={(e) => onFileChange(e.target.files?.[0])} className="hidden" />
          </label>
          <button
            type="button"
            onClick={() => setShowCameraModal(true)}
            className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/60 px-4 py-6 text-center transition hover:border-indigo-400 hover:bg-indigo-100/60 dark:border-indigo-800 dark:bg-indigo-950/25 dark:hover:border-indigo-700"
          >
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">Use camera</span>
            <span className="mt-1 text-xs text-indigo-500 dark:text-indigo-400">Capture and upload image</span>
          </button>
        </div>
        {uploadingField === fieldKey && <p className="mt-2 text-xs text-slate-500">Uploading...</p>}
        {value && (
          <a className="mt-3 inline-flex rounded-xl bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300" href={value} target="_blank" rel="noreferrer">
            View uploaded file
          </a>
        )}
      </div>

      <Modal
        open={showCameraModal}
        title={`Capture ${label}`}
        stackClassName="z-[160]"
        maxWidthClassName="max-w-2xl"
        onClose={() => setShowCameraModal(false)}
      >
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-black dark:border-slate-700">
            <video ref={videoRef} autoPlay playsInline muted className="h-[320px] w-full object-cover sm:h-[400px]" />
          </div>
          {startingCamera && <p className="text-sm text-slate-500">Starting camera...</p>}
          {cameraError && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              {cameraError}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowCameraModal(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={captureFromCamera}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Capture photo
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

const StatCard = ({
  title,
  value,
  icon: Icon,
  bgClass,
  iconClass,
}: {
  title: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  bgClass: string;
  iconClass: string;
}) => (
  <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 transition-all hover:shadow-xl dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-center justify-between gap-3 sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">{title}</p>
        <h3 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{value}</h3>
      </div>
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${bgClass} ${iconClass}`}>
        <Icon className="h-6 w-6" />
      </div>
    </div>
  </div>
);

export default function AssetManagementPage() {
  const user = useMemo(() => auth.getUser(), []);
  const canManage = user?.role !== 'employee';
  const [activeTab, setActiveTab] = useState<'assets' | 'assignments' | 'assigned' | 'stock'>('assets');
  const [employeeTab, setEmployeeTab] = useState<'current' | 'history'>('current');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [assignments, setAssignments] = useState<AssetAssignmentRecord[]>([]);
  const [myAssignments, setMyAssignments] = useState<AssetAssignmentRecord[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [divisions, setDivisions] = useState<Division[]>([]);

  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assetForm, setAssetForm] = useState<AssetFormState>({ ...emptyAssetForm });
  const [assignForm, setAssignForm] = useState<AssignFormState>({ ...emptyAssignForm });
  const [assetSearch, setAssetSearch] = useState('');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [historyAssetId, setHistoryAssetId] = useState<string | null>(null);
  const [historyRecord, setHistoryRecord] = useState<AssetAssignmentRecord | null>(null);
  const [returnAssignment, setReturnAssignment] = useState<AssetAssignmentRecord | null>(null);
  const [returnForm, setReturnForm] = useState<ReturnFormState>({ ...emptyReturnForm });

  const divisionMismatchResolveRef = useRef<((proceed: boolean) => void) | null>(null);
  const [divisionMismatch, setDivisionMismatch] = useState<DivisionMismatchPayload | null>(null);

  const requestDivisionMismatchConfirm = useCallback(
    (payload: DivisionMismatchPayload) =>
      new Promise<boolean>((resolve) => {
        divisionMismatchResolveRef.current = resolve;
        setDivisionMismatch(payload);
      }),
    []
  );

  const finishDivisionMismatch = useCallback((proceed: boolean) => {
    const resolve = divisionMismatchResolveRef.current;
    divisionMismatchResolveRef.current = null;
    setDivisionMismatch(null);
    resolve?.(proceed);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setMessage(null);

      const metadataPromise = api.getAssetMetadata();
      const myAssignmentsPromise = api.getMyAssetAssignments();

      if (canManage) {
        const [metadataRes, assetsRes, assignmentsRes, employeesRes, myRes] = await Promise.all([
          metadataPromise,
          api.getAssets(),
          api.getAssetAssignments(),
          api.getEmployees({ includeLeft: false, limit: 500, page: 1 }),
          myAssignmentsPromise,
        ]);

        setDivisions(metadataRes?.data?.divisions || []);
        setAssets(assetsRes?.data || []);
        setAssignments(assignmentsRes?.data || []);
        setMyAssignments(myRes?.data || []);
        setEmployees(employeesRes?.data || []);
      } else {
        const [metadataRes, myRes] = await Promise.all([metadataPromise, myAssignmentsPromise]);
        setDivisions(metadataRes?.data?.divisions || []);
        setMyAssignments(myRes?.data || []);
      }
    } catch (error: unknown) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to load asset management data.') });
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const availableAssets = useMemo(
    () => assets.filter((asset) => asset.status === 'available' && asset.isActive !== false),
    [assets]
  );

  const filteredAvailableAssets = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    if (!query) return availableAssets;
    return availableAssets.filter((asset) =>
      [
        asset.name,
        asset.details || '',
        asset.visibilityScope === 'division' ? getDivisionName(asset.division_id) : 'universal',
      ]
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [availableAssets, assetSearch]);

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee) =>
      [employee.employee_name, employee.emp_no].join(' ').toLowerCase().includes(query)
    );
  }, [employees, employeeSearch]);

  const selectedAssets = useMemo(
    () => availableAssets.filter((asset) => assignForm.assetIds.includes(asset._id)),
    [availableAssets, assignForm.assetIds]
  );

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee._id === assignForm.employeeId) || null,
    [employees, assignForm.employeeId]
  );

  const assignmentHistoryByAsset = useMemo(() => {
    return assignments.reduce<Record<string, AssetAssignmentRecord[]>>((acc, assignment) => {
      const assetId = assignment.asset?._id;
      if (!assetId) return acc;
      if (!acc[assetId]) acc[assetId] = [];
      acc[assetId].push(assignment);
      return acc;
    }, {});
  }, [assignments]);

  const activeAssignmentByAsset = useMemo(() => {
    return assignments.reduce<Record<string, AssetAssignmentRecord>>((acc, assignment) => {
      const assetId = assignment.asset?._id;
      if (!assetId || assignment.status !== 'assigned') return acc;
      if (!acc[assetId]) acc[assetId] = assignment;
      return acc;
    }, {});
  }, [assignments]);

  const assetsInEmployeeHand = useMemo(
    () => assets.filter((asset) => asset.status === 'assigned'),
    [assets]
  );

  const assetsWithAdmin = useMemo(() => assets, [assets]);

  const currentMyAssignments = useMemo(
    () => myAssignments.filter((assignment) => assignment.status === 'assigned'),
    [myAssignments]
  );

  const myAssignmentHistory = useMemo(
    () => myAssignments.filter((assignment) => assignment.status === 'returned'),
    [myAssignments]
  );

  const stats = useMemo(() => ({
    totalAssets: assets.length,
    assignmentRecords: assignments.length,
    assignedAssets: assetsInEmployeeHand.length,
    adminStock: assetsWithAdmin.length,
  }), [assets.length, assignments.length, assetsInEmployeeHand.length, assetsWithAdmin.length]);

  const handleFileUpload = async <T extends Record<string, any>>(
    file: File | undefined,
    field: keyof T,
    setter: Dispatch<SetStateAction<T>>
  ) => {
    if (!file) return;
    try {
      setUploadingField(String(field));
      const response = await api.uploadEvidence(file);
      const url = normalizeUrl(response);
      if (!url) throw new Error('Upload did not return a file URL');
      setter((prev) => ({ ...prev, [field]: url }));
    } catch (error: unknown) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to upload file.') });
    } finally {
      setUploadingField(null);
    }
  };

  const resetAssetForm = () => {
    setEditingAssetId(null);
    setAssetForm({ ...emptyAssetForm });
    setShowAssetModal(false);
  };

  const resetAssignForm = () => {
    setAssignForm({ ...emptyAssignForm });
    setAssetSearch('');
    setEmployeeSearch('');
    setShowAssignModal(false);
  };

  const closeHistoryModal = () => {
    setHistoryAssetId(null);
    setHistoryRecord(null);
  };

  const closeHistoryRecordModal = () => {
    setHistoryRecord(null);
  };

  const openReturnModal = (assignment: AssetAssignmentRecord) => {
    setReturnAssignment(assignment);
    setReturnForm({ ...emptyReturnForm });
  };

  const closeReturnModal = () => {
    setReturnAssignment(null);
    setReturnForm({ ...emptyReturnForm });
  };

  const submitAsset = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      setMessage(null);

      const payload = {
        ...assetForm,
        price: assetForm.price === '' ? null : Number(assetForm.price),
        expiryDate: assetForm.expiryDate || null,
        division_id: assetForm.visibilityScope === 'division' ? assetForm.division_id || null : null,
      };

      if (editingAssetId) {
        await api.updateAssetRecord(editingAssetId, payload);
        setMessage({ type: 'success', text: 'Asset updated successfully.' });
      } else {
        await api.createAsset(payload);
        setMessage({ type: 'success', text: 'Asset created successfully.' });
      }

      resetAssetForm();
      await loadData();
    } catch (error: unknown) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to save asset.') });
    } finally {
      setSaving(false);
    }
  };

  const startEditAsset = (asset: AssetRecord) => {
    setEditingAssetId(asset._id);
    setShowAssetModal(true);
    setAssetForm({
      name: asset.name || '',
      details: asset.details || '',
      price: asset.price == null ? '' : String(asset.price),
      assetPhotoUrl: asset.assetPhotoUrl || '',
      billUrl: asset.billUrl || '',
      expiryDate: asset.expiryDate ? asset.expiryDate.split('T')[0] : '',
      visibilityScope: asset.visibilityScope,
      division_id: typeof asset.division_id === 'string' ? asset.division_id : asset.division_id?._id || '',
      status: asset.status,
      isActive: asset.isActive !== false,
    });
  };

  const submitAssignment = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      setMessage(null);

      if (assignForm.assetIds.length === 0) {
        throw new Error('Select at least one asset');
      }
      if (!assignForm.employeeId) {
        throw new Error('Select an employee');
      }
      if (!assignForm.assignmentPhotoUrl || !assignForm.assignmentSignatureUrl) {
        throw new Error('Upload both photo evidence and signature');
      }

      const baseAssignPayload = {
        employeeId: assignForm.employeeId,
        assignedAt: assignForm.assignedAt,
        assignmentPhotoUrl: assignForm.assignmentPhotoUrl,
        assignmentSignatureUrl: assignForm.assignmentSignatureUrl,
        expectedReturnDate: assignForm.expectedReturnDate || null,
        assignmentNotes: assignForm.assignmentNotes,
      };

      let userConfirmedDivisionMismatch = false;
      const responses: Awaited<ReturnType<typeof api.assignAsset>>[] = [];

      for (const assetId of assignForm.assetIds) {
        let res = await api.assignAsset(assetId, {
          ...baseAssignPayload,
          confirmDivisionMismatch: userConfirmedDivisionMismatch,
        });

        if (!res.success && (res as { code?: string }).code === 'DIVISION_MISMATCH' && !userConfirmedDivisionMismatch) {
          const r = res as DivisionMismatchPayload;
          const proceed = await requestDivisionMismatchConfirm(r);
          if (!proceed) {
            throw new Error('Assignment cancelled.');
          }
          userConfirmedDivisionMismatch = true;
          res = await api.assignAsset(assetId, {
            ...baseAssignPayload,
            confirmDivisionMismatch: true,
          });
        }

        if (!res.success) {
          throw new Error(res.message || 'Failed to assign one or more assets');
        }
        responses.push(res);
      }

      const newAssignments = responses
        .map((response) => response.data as AssetAssignmentRecord | undefined)
        .filter((assignment): assignment is AssetAssignmentRecord => Boolean(assignment));

      if (newAssignments.length > 0) {
        setAssignments((prev) => [...newAssignments, ...prev]);
        setAssets((prev) =>
          prev.map((asset) =>
            assignForm.assetIds.includes(asset._id)
              ? { ...asset, status: 'assigned' }
              : asset
          )
        );
      }
      resetAssignForm();
      setMessage({
        type: 'success',
        text: `${assignForm.assetIds.length} asset${assignForm.assetIds.length > 1 ? 's' : ''} assigned successfully.`,
      });
      await loadData();
    } catch (error: unknown) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to assign asset.') });
    } finally {
      setSaving(false);
    }
  };

  const submitReturn = async (assignmentId: string) => {
    try {
      setSaving(true);
      setMessage(null);
      await api.returnAssetAssignment(assignmentId, {
        returnedAt: returnForm.returnedAt,
        returnPhotoUrl: returnForm.returnPhotoUrl,
        returnSignatureUrl: returnForm.returnSignatureUrl,
        returnNotes: returnForm.returnNotes,
      });
      closeReturnModal();
      setMessage({ type: 'success', text: 'Asset return recorded successfully.' });
      await loadData();
    } catch (error: unknown) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to return asset.') });
    } finally {
      setSaving(false);
    }
  };

  const deleteAsset = async (asset: AssetRecord) => {
    if (!window.confirm(`Delete asset "${asset.name}"? This will remove its history too.`)) return;
    try {
      setSaving(true);
      setMessage(null);
      await api.deleteAssetRecord(asset._id);
      setMessage({ type: 'success', text: 'Asset deleted successfully.' });
      await loadData();
    } catch (error: unknown) {
      setMessage({ type: 'error', text: getErrorMessage(error, 'Failed to delete asset.') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Assets Management</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {canManage
                ? 'Create assets, assign them to employees, and track returns with evidence and signatures.'
                : 'View your assigned assets and submit returns with photo evidence and signature.'}
            </p>
          </div>
          {canManage && (
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditingAssetId(null);
                  setAssetForm({ ...emptyAssetForm });
                  setShowAssetModal(true);
                }}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Create Asset
              </button>
              <button
                type="button"
                onClick={() => {
                  setAssignForm({ ...emptyAssignForm });
                  setShowAssignModal(true);
                }}
                className="rounded-xl border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:border-indigo-900/40 dark:hover:bg-indigo-950/30"
              >
                Assign Asset
              </button>
            </div>
          )}
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          Loading asset management...
        </div>
      ) : (
        <>
          {canManage && (
            <>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                <StatCard title="Total Assets" value={stats.totalAssets} icon={Boxes} bgClass="bg-blue-100 dark:bg-blue-900/20" iconClass="text-blue-600 dark:text-blue-300" />
                <StatCard title="Assignment Records" value={stats.assignmentRecords} icon={ClipboardList} bgClass="bg-violet-100 dark:bg-violet-900/20" iconClass="text-violet-600 dark:text-violet-300" />
                <StatCard title="In Employee Hand" value={stats.assignedAssets} icon={PackageCheck} bgClass="bg-amber-100 dark:bg-amber-900/20" iconClass="text-amber-600 dark:text-amber-300" />
                <StatCard title="With Super Admin" value={stats.adminStock} icon={Archive} bgClass="bg-emerald-100 dark:bg-emerald-900/20" iconClass="text-emerald-600 dark:text-emerald-300" />
              </div>

              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 sm:inline-flex items-center p-1 rounded-xl bg-slate-100/50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 backdrop-blur-sm shadow-inner w-full sm:w-auto gap-1 sm:gap-0">
                  {[
                    { id: 'assets' as const, label: 'Asset Register', icon: Boxes, count: stats.totalAssets, activeColor: 'blue' },
                    { id: 'assignments' as const, label: 'Assignments', icon: ClipboardList, count: stats.assignmentRecords, activeColor: 'violet' },
                    { id: 'assigned' as const, label: 'In Employee Hand', icon: PackageCheck, count: stats.assignedAssets, activeColor: 'orange' },
                    { id: 'stock' as const, label: 'Admin Stock', icon: CheckCircle2, count: stats.adminStock, activeColor: 'green' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`group relative flex items-center justify-center gap-2 px-2 sm:px-6 py-2 rounded-lg text-[10px] sm:text-xs font-bold transition-all duration-300 whitespace-nowrap ${
                        activeTab === tab.id
                          ? 'bg-white dark:bg-slate-700 shadow-sm ring-1 ring-slate-200/50 dark:ring-0 ' +
                            (tab.activeColor === 'green'
                              ? 'text-green-600 dark:text-green-400'
                              : tab.activeColor === 'orange'
                                ? 'text-orange-600 dark:text-orange-400'
                                : tab.activeColor === 'violet'
                                  ? 'text-violet-600 dark:text-violet-400'
                                  : 'text-blue-600 dark:text-blue-400')
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      <tab.icon className={`h-3.5 w-3.5 ${
                        activeTab === tab.id
                          ? tab.activeColor === 'green'
                            ? 'text-green-600 dark:text-green-400'
                            : tab.activeColor === 'orange'
                              ? 'text-orange-600 dark:text-orange-400'
                              : tab.activeColor === 'violet'
                                ? 'text-violet-600 dark:text-violet-400'
                                : 'text-blue-600 dark:text-blue-400'
                          : 'text-slate-400 group-hover:text-slate-600'
                      }`} />
                      <span>{tab.label}</span>
                      <span className={`flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-md text-[10px] font-black ${
                        activeTab === tab.id
                          ? tab.activeColor === 'green'
                            ? 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300'
                            : tab.activeColor === 'orange'
                              ? 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-300'
                              : tab.activeColor === 'violet'
                                ? 'bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300'
                                : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300'
                          : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {activeTab === 'assets' && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Asset Register</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left dark:border-slate-800">
                        <th className="py-2 pr-4">Name</th>
                        <th className="py-2 pr-4">Current state</th>
                        <th className="py-2 pr-4">Last assigned to</th>
                        <th className="py-2 pr-4">History</th>
                        <th className="py-2 pr-4">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assets.map((asset) => {
                        const history = assignmentHistoryByAsset[asset._id] || [];
                        const latestHistory = history[0];
                        return (
                          <Fragment key={asset._id}>
                            <tr
                              className="group cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50/80 dark:border-slate-800/70 dark:hover:bg-slate-950/40"
                              onClick={() => setHistoryAssetId(asset._id)}
                            >
                              <td className="py-3 pr-4">
                                <div className="font-medium text-slate-900 dark:text-white">{asset.name}</div>
                                <div className="text-xs text-slate-500">{asset.details || '-'}</div>
                                <div className="mt-1 text-xs text-slate-500">
                                  {asset.visibilityScope === 'division' ? `Division: ${getDivisionName(asset.division_id)}` : 'Universal'} | Price: {asset.price ?? '-'} | Expiry: {formatDate(asset.expiryDate)}
                                </div>
                              </td>
                              <td className="py-3 pr-4">
                                {asset.status === 'assigned' ? (
                                  <div>
                                    <div className="font-medium text-amber-700 dark:text-amber-300">Assigned</div>
                                    <div className="text-xs text-slate-500">In employee hand</div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="font-medium text-emerald-700 dark:text-emerald-300">With Super Admin</div>
                                    <div className="text-xs text-slate-500">
                                      {history.length > 0 ? 'Returned and available' : 'Not assigned yet'}
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td className="py-3 pr-4">
                                {latestHistory?.employee ? (
                                  <div>
                                    <div className="font-medium text-slate-900 dark:text-white">{latestHistory.employee.employee_name}</div>
                                    <div className="text-xs text-slate-500">{latestHistory.employee.emp_no}</div>
                                  </div>
                                ) : (
                                  <span className="text-slate-500">-</span>
                                )}
                              </td>
                              <td className="py-3 pr-4">
                                <button
                                  type="button"
                                  onClick={() => setHistoryAssetId(asset._id)}
                                  className="text-indigo-600 hover:text-indigo-800"
                                >
                                  {history.length} record{history.length === 1 ? '' : 's'}
                                </button>
                              </td>
                              <td className="py-3 pr-4">
                                <div className="flex flex-wrap gap-3">
                                  <button type="button" onClick={() => startEditAsset(asset)} className="text-indigo-600 hover:text-indigo-800">
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void deleteAsset(asset)}
                                    className="text-red-600 hover:text-red-800 disabled:opacity-50"
                                    disabled={asset.status === 'assigned' || saving}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          </Fragment>
                        );
                      })}
                      {assets.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-6 text-center text-slate-500">
                            No assets created yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              )}

              {activeTab === 'assignments' && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Assignment Register</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left dark:border-slate-800">
                        <th className="py-2 pr-4">Asset</th>
                        <th className="py-2 pr-4">Employee</th>
                        <th className="py-2 pr-4">Division</th>
                        <th className="py-2 pr-4">Department</th>
                        <th className="py-2 pr-4">Given date</th>
                        <th className="py-2 pr-4">Expected return</th>
                        <th className="py-2 pr-4">Return date</th>
                        <th className="py-2 pr-4">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((assignment) => (
                        <Fragment key={assignment._id}>
                          <tr key={assignment._id} className="border-b border-slate-100 dark:border-slate-800/70 align-top">
                            <td className="py-3 pr-4">
                              <div className="font-medium text-slate-900 dark:text-white">{assignment.asset?.name}</div>
                              {assignment.assignmentNotes?.trim() ? (
                                <div className="text-xs text-slate-500">{assignment.assignmentNotes}</div>
                              ) : null}
                            </td>
                            <td className="py-3 pr-4">
                              {assignment.employee?.employee_name || '-'}
                              <div className="text-xs text-slate-500">{assignment.employee?.emp_no || '-'}</div>
                            </td>
                            <td className="py-3 pr-4 text-slate-700 dark:text-slate-300">
                              {getDivisionName(assignment.division_id ?? assignment.employee?.division_id)}
                            </td>
                            <td className="py-3 pr-4 text-slate-700 dark:text-slate-300">
                              {getDepartmentName(assignment.department_id ?? assignment.employee?.department_id)}
                            </td>
                            <td className="py-3 pr-4">{formatDate(assignment.assignedAt)}</td>
                            <td className="py-3 pr-4">{formatDate(assignment.expectedReturnDate)}</td>
                            <td className="py-3 pr-4">{formatDate(assignment.returnedAt)}</td>
                            <td className="py-3 pr-4">
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  assignment.status === 'returned'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                                }`}
                              >
                                {assignment.status === 'returned' ? 'Returned' : 'Assigned'}
                              </span>
                            </td>
                          </tr>
                        </Fragment>
                      ))}
                      {assignments.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-6 text-center text-slate-500">
                            No assignments yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              )}

              {activeTab === 'assigned' && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Currently Assigned Assets</h2>
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-300">
                    {assetsInEmployeeHand.length} active
                  </span>
                </div>
                {assetsInEmployeeHand.length === 0 ? (
                  <p className="text-sm text-slate-500">Assigned assets will appear here once the assignment is completed.</p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {assetsInEmployeeHand.map((asset) => {
                      const assignment = activeAssignmentByAsset[asset._id] || null;
                      return (
                      <div key={asset._id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-slate-900 dark:text-white">{asset.name || 'Asset'}</h3>
                            {assignment?.employee ? (
                              <p className="mt-1 text-xs text-slate-500">
                                {assignment.employee.employee_name || '-'} ({assignment.employee.emp_no || '-'})
                              </p>
                            ) : (
                              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                                Assigned (details limited by scope)
                              </p>
                            )}
                          </div>
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                            Assigned
                          </span>
                        </div>
                        <div className="mt-3 space-y-1 text-xs text-slate-500">
                          <p>Given: {formatDate(assignment?.assignedAt)}</p>
                          <p>Expected return: {formatDate(assignment?.expectedReturnDate)}</p>
                          <p>Scope: {asset.visibilityScope === 'division' ? getDivisionName(asset.division_id) : 'Universal'}</p>
                        </div>
                        {assignment && (
                          <button
                            type="button"
                            onClick={() => openReturnModal(assignment)}
                            className="mt-4 w-full rounded-xl border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:border-indigo-900/40 dark:hover:bg-indigo-950/30"
                          >
                            Mark return
                          </button>
                        )}
                      </div>
                    )})}
                  </div>
                )}
              </div>
              )}

              {activeTab === 'stock' && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Admin Stock</h2>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      All assets in the register with division, pricing, assignment history count, and status.
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                    {assetsWithAdmin.length} total
                  </span>
                </div>
                {assetsWithAdmin.length === 0 ? (
                  <p className="text-sm text-slate-500">No assets available.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/80 text-left dark:border-slate-800 dark:bg-slate-950/50">
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">Item</th>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">Division</th>
                          <th className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-200">Price</th>
                          <th className="whitespace-nowrap px-4 py-3 text-center font-semibold text-slate-700 dark:text-slate-200">Records</th>
                          <th className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">Status</th>
                          <th className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-200">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assetsWithAdmin.map((asset) => {
                          const history = assignmentHistoryByAsset[asset._id] || [];
                          const recordCount = history.length;
                          const statusIsAssigned = asset.status === 'assigned';
                          const statusIsRetired = asset.status === 'retired';
                          const priceDisplay =
                            asset.price != null && !Number.isNaN(Number(asset.price))
                              ? Number(asset.price).toLocaleString(undefined, {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2,
                                })
                              : '—';
                          return (
                            <tr
                              key={asset._id}
                              className="group cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50/80 dark:border-slate-800/70 dark:hover:bg-slate-950/40"
                              onClick={() => setHistoryAssetId(asset._id)}
                            >
                              <td className="max-w-[min(280px,40vw)] px-4 py-3 align-top">
                                <span className="font-medium text-indigo-600 group-hover:text-indigo-800 group-hover:underline dark:text-indigo-400 dark:group-hover:text-indigo-300">
                                  {asset.name || '—'}
                                </span>
                                {asset.details ? (
                                  <div className="mt-1 line-clamp-2 text-xs text-slate-500">{asset.details}</div>
                                ) : null}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 align-middle text-slate-700 dark:text-slate-300">
                                {asset.visibilityScope === 'division' ? getDivisionName(asset.division_id) : 'Universal'}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right align-middle tabular-nums text-slate-800 dark:text-slate-200">
                                {priceDisplay}
                              </td>
                              <td className="px-4 py-3 text-center align-middle tabular-nums text-slate-800 dark:text-slate-200">
                                {recordCount}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 align-middle">
                                <span
                                  className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                                    statusIsAssigned
                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300'
                                      : statusIsRetired
                                        ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'
                                  }`}
                                >
                                  {statusIsAssigned ? 'In hand' : statusIsRetired ? 'Retired' : 'Available'}
                                </span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-right align-middle">
                                <button
                                  type="button"
                                  onClick={() => setHistoryAssetId(asset._id)}
                                  className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-600 shadow-sm transition hover:bg-indigo-50 dark:border-indigo-900/50 dark:bg-slate-900 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                                >
                                  View history
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              )}
            </>
          )}

          {!canManage && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">My Assets</h2>
                  <p className="mt-1 text-sm text-slate-500">Track current assets and keep a full history of returned items.</p>
                </div>
                <div className="grid grid-cols-2 sm:inline-flex items-center rounded-xl border border-slate-200/60 bg-slate-100/50 p-1 shadow-inner dark:border-slate-700/60 dark:bg-slate-800/50">
                  {[
                    { id: 'current' as const, label: 'Current Assets', count: currentMyAssignments.length },
                    { id: 'history' as const, label: 'Assets History', count: myAssignmentHistory.length },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setEmployeeTab(tab.id)}
                      className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition-all ${
                        employeeTab === tab.id
                          ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200/50 dark:bg-slate-700 dark:text-indigo-300 dark:ring-0'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-md px-1 text-[10px] font-black ${
                        employeeTab === tab.id
                          ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/30 dark:text-indigo-300'
                          : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {myAssignments.length === 0 ? (
                <p className="text-sm text-slate-500">No asset records found.</p>
              ) : employeeTab === 'current' ? (
                currentMyAssignments.length === 0 ? (
                  <p className="text-sm text-slate-500">You do not have any active assets right now.</p>
                ) : (
                  <div className="space-y-4">
                    {currentMyAssignments.map((assignment) => (
                      <div key={assignment._id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-slate-900 dark:text-white">{assignment.asset?.name || 'Asset'}</h3>
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                                In Hand
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-slate-500">{assignment.asset?.details || 'No details added.'}</p>
                            <div className="mt-3 space-y-1 text-xs text-slate-500">
                              <p>Given: {formatDate(assignment.assignedAt)}</p>
                              <p>Expected return: {formatDate(assignment.expectedReturnDate)}</p>
                              <p>Scope: {assignment.asset?.visibilityScope === 'division' ? getDivisionName(assignment.asset?.division_id) : 'Universal'}</p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setHistoryRecord(assignment)}
                              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                              History
                            </button>
                            <button type="button" onClick={() => openReturnModal(assignment)} className="rounded-xl border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:border-indigo-900/40 dark:hover:bg-indigo-950/30">
                              Return Asset
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : myAssignmentHistory.length === 0 ? (
                <p className="text-sm text-slate-500">Returned assets will appear here as your history.</p>
              ) : (
                <div className="space-y-4">
                  {myAssignmentHistory.map((assignment) => (
                    <div key={assignment._id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/40">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-slate-900 dark:text-white">{assignment.asset?.name || 'Asset'}</h3>
                            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                              Returned
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-slate-500">{assignment.asset?.details || 'No details added.'}</p>
                          <div className="mt-3 space-y-1 text-xs text-slate-500">
                            <p>Taken on: {formatDate(assignment.assignedAt)}</p>
                            <p>Returned on: {formatDate(assignment.returnedAt)}</p>
                            <p>Expected return: {formatDate(assignment.expectedReturnDate)}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setHistoryRecord(assignment)}
                          className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          Open Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {divisionMismatch ? (
        <Modal
          open
          title="Division mismatch"
          stackClassName="z-[140]"
          maxWidthClassName="max-w-lg"
          onClose={() => finishDivisionMismatch(false)}
        >
          <div className="space-y-5">
            <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 dark:border-amber-900/40 dark:bg-amber-950/25">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
              <p className="text-sm leading-relaxed text-amber-950 dark:text-amber-100">
                {divisionMismatch.message ||
                  'The asset is linked to a different division than the selected employee.'}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/30">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-indigo-600 dark:text-indigo-300">Asset linked division</p>
                <p className="mt-2 text-base font-bold text-slate-900 dark:text-white">{divisionMismatch.assetDivision?.name || '—'}</p>
                {divisionMismatch.assetDivision?.code ? (
                  <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">Code: {divisionMismatch.assetDivision.code}</p>
                ) : null}
              </div>
              <div className="rounded-2xl border border-violet-100 bg-violet-50/60 p-4 dark:border-violet-900/40 dark:bg-violet-950/30">
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">Employee division</p>
                <p className="mt-2 text-base font-bold text-slate-900 dark:text-white">{divisionMismatch.employeeDivision?.name || '—'}</p>
                {divisionMismatch.employeeDivision?.code ? (
                  <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-400">Code: {divisionMismatch.employeeDivision.code}</p>
                ) : null}
              </div>
            </div>

            {divisionMismatch.assetName ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
                <span className="font-semibold text-slate-900 dark:text-white">Asset:</span> {divisionMismatch.assetName}
              </p>
            ) : null}

            <p className="text-sm text-slate-600 dark:text-slate-400">
              Assigning across divisions is allowed after you confirm. Choose <span className="font-semibold text-slate-800 dark:text-slate-200">Assign anyway</span> to continue, or cancel to go back.
            </p>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5 dark:border-slate-800">
              <button
                type="button"
                onClick={() => finishDivisionMismatch(false)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => finishDivisionMismatch(true)}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                Assign anyway
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      <Modal
        open={showAssetModal}
        title={editingAssetId ? 'Edit Asset' : 'Create Asset'}
        onClose={resetAssetForm}
      >
        <form onSubmit={submitAsset} className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">Asset name</label>
            <input className={searchInputClassName} placeholder="Enter asset name" value={assetForm.name} onChange={(e) => setAssetForm((prev) => ({ ...prev, name: e.target.value }))} required />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">Price</label>
            <input className={searchInputClassName} placeholder="Enter asset price" type="number" min="0" step="0.01" value={assetForm.price} onChange={(e) => setAssetForm((prev) => ({ ...prev, price: e.target.value }))} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40 lg:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">Asset details</label>
            <textarea className={`${searchInputClassName} min-h-[110px]`} placeholder="Add asset details" value={assetForm.details} onChange={(e) => setAssetForm((prev) => ({ ...prev, details: e.target.value }))} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <label className="mb-3 block text-sm font-semibold text-slate-800 dark:text-slate-100">Visibility</label>
            <div className="grid grid-cols-2 gap-3">
              {(['universal', 'division'] as AssetScope[]).map((scope) => {
                const active = assetForm.visibilityScope === scope;
                return (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => setAssetForm((prev) => ({ ...prev, visibilityScope: scope, division_id: scope === 'division' ? prev.division_id : '' }))}
                    className={`rounded-2xl border px-4 py-4 text-left transition ${
                      active
                        ? 'border-indigo-500 bg-indigo-50 shadow-sm dark:border-indigo-500 dark:bg-indigo-950/30'
                        : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-900'
                    }`}
                  >
                    <div className="font-semibold text-slate-900 dark:text-white">{scope === 'universal' ? 'Universal' : 'Particular Division'}</div>
                    <div className="mt-1 text-xs text-slate-500">{scope === 'universal' ? 'Visible across all divisions' : 'Restricted to one division'}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">Division</label>
            <select className={searchInputClassName} value={assetForm.division_id} onChange={(e) => setAssetForm((prev) => ({ ...prev, division_id: e.target.value }))} disabled={assetForm.visibilityScope !== 'division'}>
              <option value="">Select division</option>
              {divisions.map((division) => (
                <option key={division._id} value={division._id}>
                  {division.name}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">Expiry date</label>
            <input className={searchInputClassName} type="date" value={assetForm.expiryDate} onChange={(e) => setAssetForm((prev) => ({ ...prev, expiryDate: e.target.value }))} />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">Status</label>
            <select className={searchInputClassName} value={assetForm.status} onChange={(e) => setAssetForm((prev) => ({ ...prev, status: e.target.value as AssetFormState['status'] }))}>
              <option value="available">Available</option>
              <option value="retired">Retired</option>
              {assetForm.status === 'assigned' && <option value="assigned">Assigned (Read-only)</option>}
            </select>
          </div>

          <UploadField
            label="Asset photo"
            value={assetForm.assetPhotoUrl}
            fieldKey="assetPhotoUrl"
            uploadingField={uploadingField}
            accept="image/*"
            onFileChange={(file) => void handleFileUpload(file, 'assetPhotoUrl', setAssetForm)}
          />

          <UploadField
            label="Bill"
            value={assetForm.billUrl}
            fieldKey="billUrl"
            uploadingField={uploadingField}
            accept="image/*,.pdf"
            onFileChange={(file) => void handleFileUpload(file, 'billUrl', setAssetForm)}
          />

          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-200 lg:col-span-2">
            <input type="checkbox" checked={assetForm.isActive} onChange={(e) => setAssetForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
            Asset is active
          </label>

          <div className="flex gap-3 lg:col-span-2">
            <button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
              {saving ? 'Saving...' : editingAssetId ? 'Update Asset' : 'Create Asset'}
            </button>
            <button type="button" onClick={resetAssetForm} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={showAssignModal}
        title="Assign Asset"
        onClose={resetAssignForm}
      >
        <form onSubmit={submitAssignment} className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Search and select assets</label>
            <input
              className={searchInputClassName}
              placeholder="Search by asset name or scope"
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
            />
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="mb-3 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  {selectedAssets.length > 0
                    ? `${selectedAssets.length} asset${selectedAssets.length > 1 ? 's' : ''} selected`
                    : 'No asset selected'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAssignForm((prev) => ({ ...prev, assetIds: [] }));
                    setAssetSearch('');
                  }}
                  className="text-indigo-600 hover:text-indigo-800"
                >
                  Clear
                </button>
              </div>
              <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                {filteredAvailableAssets.map((asset) => {
                  const isSelected = assignForm.assetIds.includes(asset._id);
                  return (
                    <button
                      key={asset._id}
                      type="button"
                      onClick={() =>
                        setAssignForm((prev) => ({
                          ...prev,
                          assetIds: prev.assetIds.includes(asset._id)
                            ? prev.assetIds.filter((id) => id !== asset._id)
                            : [...prev.assetIds, asset._id],
                        }))
                      }
                      className={`block w-full rounded-2xl border px-4 py-4 text-left text-sm transition ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-500 dark:bg-indigo-950/30 dark:text-indigo-300'
                          : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{asset.name}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {asset.visibilityScope === 'division' ? getDivisionName(asset.division_id) : 'Universal'}
                          </div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isSelected ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                          {isSelected ? 'Selected' : 'Select'}
                        </span>
                      </div>
                    </button>
                  );
                })}
                {filteredAvailableAssets.length === 0 && (
                  <div className="px-3 py-4 text-sm text-slate-500">No matching assets found.</div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Select employee</label>
            <input
              className={searchInputClassName}
              placeholder="Search by employee name or ID"
              value={employeeSearch}
              onChange={(e) => setEmployeeSearch(e.target.value)}
            />
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="mb-3 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  {selectedEmployee
                    ? `Selected: ${selectedEmployee.employee_name} (${selectedEmployee.emp_no})`
                    : 'No employee selected'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAssignForm((prev) => ({ ...prev, employeeId: '' }));
                    setEmployeeSearch('');
                  }}
                  className="text-indigo-600 hover:text-indigo-800"
                >
                  Clear
                </button>
              </div>
              <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                {filteredEmployees.map((employee) => {
                  const isSelected = assignForm.employeeId === employee._id;
                  return (
                    <button
                      key={employee._id}
                      type="button"
                      onClick={() => setAssignForm((prev) => ({ ...prev, employeeId: employee._id }))}
                      className={`block w-full rounded-2xl border px-4 py-4 text-left text-sm transition ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-500 dark:bg-indigo-950/30 dark:text-indigo-300'
                          : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-indigo-800'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{employee.employee_name}</div>
                          <div className="mt-1 text-xs text-slate-500">{employee.emp_no}</div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${isSelected ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                          {isSelected ? 'Selected' : 'Select'}
                        </span>
                      </div>
                    </button>
                  );
                })}
                {filteredEmployees.length === 0 && (
                  <div className="px-3 py-4 text-sm text-slate-500">No matching employees found.</div>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">Given date</label>
            <input className={searchInputClassName} type="date" value={assignForm.assignedAt} onChange={(e) => setAssignForm((prev) => ({ ...prev, assignedAt: e.target.value }))} required />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">Expected return date</label>
            <input className={searchInputClassName} type="date" value={assignForm.expectedReturnDate} onChange={(e) => setAssignForm((prev) => ({ ...prev, expectedReturnDate: e.target.value }))} />
          </div>

          <UploadField
            label="Given photo evidence"
            value={assignForm.assignmentPhotoUrl}
            fieldKey="assignmentPhotoUrl"
            uploadingField={uploadingField}
            accept="image/*,.pdf"
            onFileChange={(file) => void handleFileUpload(file, 'assignmentPhotoUrl', setAssignForm)}
          />

          <UploadField
            label="Employee signature"
            value={assignForm.assignmentSignatureUrl}
            fieldKey="assignmentSignatureUrl"
            uploadingField={uploadingField}
            accept="image/*,.pdf"
            onFileChange={(file) => void handleFileUpload(file, 'assignmentSignatureUrl', setAssignForm)}
          />

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40 lg:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">Assignment notes</label>
            <textarea className={`${searchInputClassName} min-h-[110px]`} placeholder="Add assignment notes" value={assignForm.assignmentNotes} onChange={(e) => setAssignForm((prev) => ({ ...prev, assignmentNotes: e.target.value }))} />
          </div>

          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/80 p-4 text-sm dark:border-indigo-900/40 dark:bg-indigo-950/20 lg:col-span-2">
            <div className="font-semibold text-indigo-800 dark:text-indigo-200">Assignment summary</div>
            <div className="mt-2 text-indigo-700 dark:text-indigo-300">
              {selectedAssets.length > 0
                ? `${selectedAssets.length} asset${selectedAssets.length > 1 ? 's' : ''} ready to assign`
                : 'Select one or more assets'}
              {' '}to{' '}
              {selectedEmployee ? `${selectedEmployee.employee_name} (${selectedEmployee.emp_no})` : 'an employee'}.
            </div>
          </div>

          <div className="flex gap-3 lg:col-span-2">
            <button type="submit" disabled={saving} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
              {saving ? 'Saving...' : `Assign ${assignForm.assetIds.length || ''} Asset${assignForm.assetIds.length === 1 ? '' : 's'}`.trim()}
            </button>
            <button type="button" onClick={resetAssignForm} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(historyAssetId)}
        title="Asset Details & History"
        onClose={closeHistoryModal}
        maxWidthClassName="max-w-[98vw] lg:max-w-[1600px]"
      >
        <div className="flex flex-col md:flex-row">
          {/* Left section: Item Details & Photos (40%) */}
          <div className="w-full border-slate-200 p-6 md:w-[40%] md:border-r dark:border-slate-800">
            {(() => {
              const asset = assets.find((a) => a._id === historyAssetId);
              if (!asset) return <p className="text-sm text-slate-500 text-center py-8">Asset information not found.</p>;
              return (
                <div className="space-y-6">
                  {/* Detailed Box */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">{asset.name}</h3>
                        <p className="mt-1 text-sm text-slate-500">{asset.details || "No details added."}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${
                          asset.status === "assigned"
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                            : asset.status === "retired"
                              ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300"
                        }`}
                      >
                        {asset.status === "assigned" ? "Assigned" : asset.status === "retired" ? "Retired" : "Available"}
                      </span>
                    </div>

                    <div className="mt-5 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                      <div className="flex justify-between border-b border-slate-200/60 pb-2 dark:border-slate-800">
                        <span className="text-slate-500">Visibility Scope</span>
                        <span className="font-medium text-slate-900 dark:text-slate-200">
                          {asset.visibilityScope === "division" ? getDivisionName(asset.division_id) : "Universal"}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200/60 pb-2 dark:border-slate-800">
                        <span className="text-slate-500">Price</span>
                        <span className="font-bold text-slate-900 dark:text-slate-200">
                          {asset.price != null ? `₹${Number(asset.price).toLocaleString()}` : "—"}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-slate-200/60 pb-2 dark:border-slate-800">
                        <span className="text-slate-500">Expiry Date</span>
                        <span className="font-medium text-slate-900 dark:text-slate-200">{formatDate(asset.expiryDate)}</span>
                      </div>
                      {activeAssignmentByAsset[asset._id]?.employee && (
                        <div className="flex justify-between rounded-xl bg-amber-50/50 p-2 dark:bg-amber-950/10 sm:col-span-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Current Custodian</span>
                          <div className="text-right">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">
                              {activeAssignmentByAsset[asset._id].employee?.employee_name}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              Emp No: {activeAssignmentByAsset[asset._id].employee?.emp_no}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Photos Section (Side-by-Side) */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Asset Photo</p>
                      {asset.assetPhotoUrl ? (
                        isImageFile(asset.assetPhotoUrl) ? (
                          <a href={asset.assetPhotoUrl} target="_blank" rel="noreferrer" className="block h-48 overflow-hidden rounded-2xl border-2 border-slate-100 bg-slate-50 transition hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-900/50">
                            <img src={asset.assetPhotoUrl} alt="Asset" className="h-full w-full object-contain" />
                          </a>
                        ) : (
                          <a href={asset.assetPhotoUrl} target="_blank" rel="noreferrer" className="flex h-16 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs font-semibold text-indigo-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
                            View Document
                          </a>
                        )
                      ) : (
                        <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                          No Photo
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Purchase Bill</p>
                      {asset.billUrl ? (
                        isImageFile(asset.billUrl) ? (
                          <a href={asset.billUrl} target="_blank" rel="noreferrer" className="block h-48 overflow-hidden rounded-2xl border-2 border-slate-100 bg-slate-50 transition hover:border-indigo-400 dark:border-slate-800 dark:bg-slate-900/50">
                            <img src={asset.billUrl} alt="Bill" className="h-full w-full object-contain" />
                          </a>
                        ) : (
                          <a href={asset.billUrl} target="_blank" rel="noreferrer" className="flex h-16 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs font-semibold text-indigo-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
                            View Bill
                          </a>
                        )
                      ) : (
                        <div className="flex h-16 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-400 dark:border-slate-800 dark:bg-slate-900">
                          No Bill
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Right section: Assignment History */}
          <div className="flex-1 min-w-0 bg-white p-6 dark:bg-slate-950">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">Assignment History</h3>
                <p className="text-xs text-slate-500">Record of all previous custodians</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                {historyAssetId ? (assignmentHistoryByAsset[historyAssetId] || []).length : 0} Records
              </span>
            </div>

            {historyAssetId && (assignmentHistoryByAsset[historyAssetId] || []).length === 0 ? (
              <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center dark:border-slate-800 dark:bg-slate-950/20">
                <div className="rounded-full bg-slate-100 p-4 dark:bg-slate-800">
                  <Archive className="h-8 w-8 text-slate-400" />
                </div>
                <h4 className="mt-4 font-semibold text-slate-900 dark:text-slate-200">No History Found</h4>
                <p className="mt-1 text-sm text-slate-500">This asset has not been assigned to any employee yet.</p>
              </div>
            ) : historyAssetId ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/50 text-left dark:border-slate-800 dark:bg-slate-950/50">
                      <th className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">Employee</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">Org Context</th>
                      <th className="whitespace-nowrap px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">Timeline</th>
                      <th className="whitespace-nowrap px-4 py-3 pr-4 text-right font-semibold text-slate-700 dark:text-slate-200">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
                    {(assignmentHistoryByAsset[historyAssetId] || []).map((record) => (
                      <tr key={record._id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-950/40">
                        <td className="px-4 py-4">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {record.employee?.employee_name || "-"}
                          </div>
                          <div className="text-xs text-slate-500">
                            ID: {record.employee?.emp_no || "-"}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Div: {getDivisionName(record.division_id ?? record.employee?.division_id)}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            Dept: {getDepartmentName(record.department_id ?? record.employee?.department_id)}
                          </div>
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            Desig: {getDesignationName(record.designation_id ?? (record.employee as any)?.designation_id)}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex gap-4">
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Given</p>
                              <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">{formatDate(record.assignedAt)}</p>
                            </div>
                            {record.status === "returned" ? (
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Returned</p>
                                <p className="mt-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">{formatDate(record.returnedAt)}</p>
                              </div>
                            ) : (
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-amber-500">Current</p>
                                <span className="mt-0.5 inline-block rounded bg-amber-50 px-1 py-0.5 text-[9px] font-bold text-amber-600 dark:bg-amber-950/20">Active</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => setHistoryRecord(record)}
                            className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-bold text-indigo-600 shadow-sm transition hover:bg-indigo-50 dark:border-indigo-900/50 dark:bg-slate-900 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                          >
                            View details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(historyRecord)}
        title="History Details"
        onClose={closeHistoryRecordModal}
      >
        {historyRecord && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
              <div className="font-semibold text-slate-900 dark:text-white">
                {historyRecord.employee?.employee_name || '-'} ({historyRecord.employee?.emp_no || '-'})
              </div>
              <div className="mt-2 grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                <p>Assigned on: {formatDate(historyRecord.assignedAt)}</p>
                <p>Assigned by: {historyRecord.issuedBy?.name || 'System'}</p>
                <p>Status: {historyRecord.status}</p>
                <p>Expected return: {formatDate(historyRecord.expectedReturnDate)}</p>
                <p>Returned on: {formatDate(historyRecord.returnedAt)}</p>
                <p>Returned by: {historyRecord.returnedBy?.name || '-'}</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Assignment photo evidence</div>
                {historyRecord.assignmentPhotoUrl ? (
                  <a href={historyRecord.assignmentPhotoUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-xl bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300">
                    Open uploaded file
                  </a>
                ) : (
                  <p className="text-sm text-slate-500">No file uploaded.</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Assignment signature</div>
                {historyRecord.assignmentSignatureUrl ? (
                  <a href={historyRecord.assignmentSignatureUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-xl bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300">
                    Open uploaded file
                  </a>
                ) : (
                  <p className="text-sm text-slate-500">No file uploaded.</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Return photo evidence</div>
                {historyRecord.returnPhotoUrl ? (
                  <a href={historyRecord.returnPhotoUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-xl bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300">
                    Open uploaded file
                  </a>
                ) : (
                  <p className="text-sm text-slate-500">No return file uploaded.</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Return signature</div>
                {historyRecord.returnSignatureUrl ? (
                  <a href={historyRecord.returnSignatureUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-xl bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300">
                    Open uploaded file
                  </a>
                ) : (
                  <p className="text-sm text-slate-500">No return signature uploaded.</p>
                )}
              </div>
            </div>

            {(historyRecord.assignmentNotes || historyRecord.returnNotes) && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Notes</div>
                {historyRecord.assignmentNotes && (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    Assignment: {historyRecord.assignmentNotes}
                  </p>
                )}
                {historyRecord.returnNotes && (
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                    Return: {historyRecord.returnNotes}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>


      <Modal
        open={Boolean(returnAssignment)}
        title="Make Return"
        onClose={closeReturnModal}
      >
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="font-semibold text-slate-900 dark:text-white">{returnAssignment?.asset?.name || 'Asset'}</div>
          <div className="mt-1 text-xs text-slate-500">
            {returnAssignment?.employee?.employee_name || '-'} ({returnAssignment?.employee?.emp_no || '-'})
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40">
            <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">Return date</label>
            <input className={searchInputClassName} type="date" value={returnForm.returnedAt} onChange={(e) => setReturnForm((prev) => ({ ...prev, returnedAt: e.target.value }))} />
          </div>
          <div />

          <UploadField
            label="Return item photo"
            value={returnForm.returnPhotoUrl}
            fieldKey="returnPhotoUrl"
            uploadingField={uploadingField}
            accept="image/*,.pdf"
            onFileChange={(file) => void handleFileUpload(file, 'returnPhotoUrl', setReturnForm)}
          />

          <UploadField
            label="Return signature"
            value={returnForm.returnSignatureUrl}
            fieldKey="returnSignatureUrl"
            uploadingField={uploadingField}
            accept="image/*,.pdf"
            onFileChange={(file) => void handleFileUpload(file, 'returnSignatureUrl', setReturnForm)}
          />

          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-950/40 lg:col-span-2">
            <label className="mb-2 block text-sm font-semibold text-slate-800 dark:text-slate-100">Return notes</label>
            <textarea className={`${searchInputClassName} min-h-[110px]`} placeholder="Return notes" value={returnForm.returnNotes} onChange={(e) => setReturnForm((prev) => ({ ...prev, returnNotes: e.target.value }))} />
          </div>

          <div className="flex gap-3 lg:col-span-2">
            <button type="button" disabled={saving || !returnAssignment} onClick={() => returnAssignment && void submitReturn(returnAssignment._id)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
              {saving ? 'Saving...' : 'Submit Return'}
            </button>
            <button type="button" onClick={closeReturnModal} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
