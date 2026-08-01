import React, { useState, useMemo } from 'react';
import { X, Upload, Layers, DoorOpen, Info } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function AddBuildingModal({ onClose }) {
  const { addBuilding } = useApp();
  const [form, setForm] = useState({
    name: '',
    prefix: '',
    prefixCustom: false,
    numFloors: 1,
    roomsPerFloor: 5,
    image: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Image file size must be less than 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setForm((f) => ({ ...f, image: event.target?.result || '' }));
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const generatePrefix = (val) => {
    const words = val.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return words.map((w) => w[0]).join('').toUpperCase();
    return val.slice(0, 3).toUpperCase();
  };

  const computedPrefix = useMemo(() => {
    if (form.prefixCustom && form.prefix.trim()) return form.prefix.trim().toUpperCase();
    return generatePrefix(form.name) || 'BLD';
  }, [form.name, form.prefix, form.prefixCustom]);

  const previewRooms = useMemo(() => {
    const floors = Math.max(1, parseInt(form.numFloors, 10) || 1);
    const rPerFloor = Math.max(0, parseInt(form.roomsPerFloor, 10) || 0);
    const prefix = computedPrefix;

    const list = [];
    for (let f = 1; f <= Math.min(floors, 5); f += 1) {
      const sampleRooms = [];
      const countToDisplay = Math.min(rPerFloor, 4);
      for (let r = 1; r <= countToDisplay; r += 1) {
        const numPadded = String(r).padStart(2, '0');
        sampleRooms.push(`${prefix} - ${f}${numPadded}`);
      }
      if (rPerFloor > 4) {
        sampleRooms.push(`... (+${rPerFloor - 4} more)`);
      }
      list.push({ floor: f, rooms: sampleRooms });
    }
    if (floors > 5) {
      list.push({ floor: '...', rooms: [`+ ${floors - 5} more floor(s)`] });
    }
    return { floors, rPerFloor, totalRooms: floors * rPerFloor, list };
  }, [form.numFloors, form.roomsPerFloor, computedPrefix]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Building name is required.');
      return;
    }
    const finalPrefix = (form.prefix?.trim() || generatePrefix(form.name)).toUpperCase();
    if (!finalPrefix) {
      setError('Building prefix is required.');
      return;
    }
    if (!form.image) {
      setError('Building image is required. Please upload a building photo.');
      return;
    }

    const floorsNum = Math.max(1, parseInt(form.numFloors, 10) || 1);
    const roomsNum = Math.max(0, parseInt(form.roomsPerFloor, 10) || 0);

    setLoading(true);
    setError('');
    try {
      await addBuilding({
        name: form.name.trim(),
        prefix: finalPrefix,
        numFloors: floorsNum,
        roomsPerFloor: roomsNum,
        image: form.image,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create building.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg p-7 relative max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-black mb-1" style={{ color: '#7A0808' }}>
          Add New Building
        </h2>
        <p className="text-xs text-gray-400 mb-5">
          Create a new building and automatically generate its floors and room numbers.
        </p>

        {error && (
          <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3.5 py-2.5 mb-4">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Building Name & Building Prefix */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label font-bold text-gray-700 mb-1">
                Building Name <span className="text-red-500">*</span>
              </label>
              <input
                className="form-input"
                placeholder="e.g., Techhub"
                value={form.name}
                onChange={(e) => {
                  const val = e.target.value;
                  setForm((f) => ({
                    ...f,
                    name: val,
                    prefix: f.prefixCustom ? f.prefix : generatePrefix(val),
                  }));
                }}
                required
              />
            </div>
            <div>
              <label className="form-label font-bold text-gray-700 mb-1">
                Building Prefix <span className="text-red-500">*</span>
              </label>
              <input
                className="form-input font-bold uppercase"
                placeholder="e.g., TH"
                value={form.prefix}
                onChange={(e) =>
                  setForm((f) => ({ ...f, prefix: e.target.value.toUpperCase(), prefixCustom: true }))
                }
                required
              />
              <p className="text-[10px] text-gray-400 mt-1">e.g. TH for Techhub</p>
            </div>
          </div>

          {/* Number of Floors & Rooms per Floor */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-gray-50/70 border border-gray-200 rounded-xl">
            <div>
              <label className="form-label font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                <Layers size={14} className="text-[#7A0808]" /> Number of Floors <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="50"
                className="form-input bg-white font-bold"
                value={form.numFloors}
                onChange={(e) => setForm((f) => ({ ...f, numFloors: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                required
              />
            </div>
            <div>
              <label className="form-label font-bold text-gray-700 mb-1 flex items-center gap-1.5">
                <DoorOpen size={14} className="text-[#7A0808]" /> Rooms per Floor <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                max="99"
                className="form-input bg-white font-bold"
                value={form.roomsPerFloor}
                onChange={(e) => setForm((f) => ({ ...f, roomsPerFloor: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                required
              />
            </div>
          </div>

          {/* Live Automatic Room Format & Preview */}
          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-950 flex items-center gap-1.5 text-xs">
                <Info size={14} className="text-amber-700" /> Automatic Room Format
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-200/70 text-amber-900">
                {previewRooms.totalRooms} total room(s)
              </span>
            </div>

            <p className="text-[11px] text-amber-900 font-medium">
              Format: <span className="font-black text-[#7A0808]">{computedPrefix} - 101</span> where <span className="font-bold">1</span> = Floor number, and <span className="font-bold">01</span> = Room number.
            </p>

            {previewRooms.totalRooms > 0 && (
              <div className="pt-2 border-t border-amber-200/60 space-y-1.5">
                <p className="text-[10px] font-bold uppercase text-amber-900 tracking-wider">Preview Generated Rooms:</p>
                {previewRooms.list.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[11px]">
                    <span className="font-bold text-amber-900 min-w-[50px]">Floor {item.floor}:</span>
                    <div className="flex flex-wrap gap-1">
                      {item.rooms.map((rm, rIdx) => (
                        <span
                          key={rIdx}
                          className="px-2 py-0.5 rounded-md bg-white border border-amber-200 text-amber-950 font-bold text-[10px]"
                        >
                          {rm}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Building Image Upload (Required) */}
          <div>
            <label className="form-label font-bold text-gray-700 mb-1">
              Building Image <span className="text-red-500">*</span>
            </label>
            {form.image ? (
              <div className="relative rounded-xl overflow-hidden h-36 border border-gray-200 group shadow-sm">
                <img src={form.image} alt="Building preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, image: '' }))}
                  className="absolute top-2 right-2 bg-black/70 hover:bg-red-600 text-white p-1.5 rounded-lg transition-colors shadow-md"
                  title="Remove image"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className={`flex flex-col items-center justify-center h-28 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                error && !form.image ? 'border-red-400 bg-red-50/50' : 'border-gray-300 hover:border-[#7A0808] bg-gray-50/50 hover:bg-gray-50'
              }`}>
                <div className="flex flex-col items-center gap-1">
                  <Upload size={20} className={error && !form.image ? 'text-red-500' : 'text-gray-400'} />
                  <span className="text-xs font-semibold text-gray-700">Click to upload building image</span>
                  <span className="text-[10px] text-gray-400">PNG, JPG, WEBP up to 5MB (Required)</span>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} required />
              </label>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-outline-maroon flex-1 justify-center py-2.5 text-xs font-bold"
              style={{ borderRadius: 10 }}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-maroon flex-1 justify-center py-2.5 text-xs font-bold shadow-md"
              style={{ borderRadius: 10 }}
              disabled={loading}
            >
              {loading ? 'Creating…' : 'Create Building & Rooms'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
