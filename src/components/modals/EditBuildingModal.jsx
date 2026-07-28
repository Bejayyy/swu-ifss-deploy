import React, { useState } from 'react';
import { X, Upload, Plus, Minus } from 'lucide-react';

const R = 10;

export default function EditBuildingModal({ building, onClose, onSave }) {
  const [form, setForm] = useState({
    name: building?.name || '',
    prefix: building?.prefix || building?.code || '',
    image: building?.image || '',
    floors: building?.floorData?.length
      ? building.floorData.map((f) => f.label || `Floor ${f.floor}`)
      : Array.from({ length: building?.floors || 1 }, (_, i) => `Floor ${i + 1}`),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!building) return null;

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
    };
    reader.readAsDataURL(file);
  };

  const addFloorRow = () =>
    setForm((f) => ({ ...f, floors: [...f.floors, `Floor ${f.floors.length + 1}`] }));

  const removeFloor = (i) =>
    setForm((f) => ({ ...f, floors: f.floors.filter((_, idx) => idx !== i) }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Building name is required.');
      return;
    }
    if (!form.prefix.trim()) {
      setError('Building prefix is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onSave(building.id, {
        name: form.name.trim(),
        prefix: form.prefix.trim().toUpperCase(),
        image: form.image,
        floorNames: form.floors,
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update building.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md shadow-xl relative m-4 border border-gray-100 max-h-[90vh] overflow-y-auto rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-black text-base" style={{ color: '#2B3235' }}>Edit Building</h2>
          <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && (
            <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label">Building Name</label>
              <input
                className="form-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="form-label">Building Prefix</label>
              <input
                className="form-input"
                placeholder="e.g. PH"
                value={form.prefix}
                onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value.toUpperCase() }))}
                required
              />
              <p className="text-[10px] text-gray-400 mt-1">Used for rooms (e.g. PH - 101)</p>
            </div>
          </div>

          {/* Building Image */}
          <div>
            <label className="form-label">Building Image / Photo</label>
            {form.image ? (
              <div className="relative rounded-xl overflow-hidden h-40 border border-gray-200 group mb-3 shadow-sm bg-gray-50">
                <img src={form.image} alt="Building preview" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                  <label className="btn-maroon text-xs gap-1.5 py-1.5 px-3 cursor-pointer shadow-md">
                    <Upload size={14} /> Change Photo
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, image: '' }))}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1 shadow-md"
                  >
                    <X size={14} /> Remove
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-[#7A0808] hover:bg-red-50/20 transition-all bg-gray-50/50 mb-3">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-full bg-red-50 text-[#7A0808] flex items-center justify-center mb-1">
                    <Upload size={18} />
                  </div>
                  <span className="text-xs font-bold text-gray-700">Click to upload building photo</span>
                  <span className="text-[10px] text-gray-400">PNG, JPG, WEBP up to 5MB</span>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            )}
          </div>

          {/* Floors Section */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <label className="form-label mb-0">Floors ({form.floors.length} total)</label>
              <button
                type="button"
                onClick={addFloorRow}
                className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors"
                style={{ color: '#7A0808', borderColor: '#7A0808' }}
              >
                <Plus size={12} /> Add Floor
              </button>
            </div>
            <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
              {form.floors.map((fl, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className="form-input flex-1"
                    value={fl}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        floors: f.floors.map((x, idx) => (idx === i ? e.target.value : x)),
                      }))
                    }
                  />
                  {form.floors.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeFloor(i)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Minus size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              className="btn-outline-maroon flex-1 justify-center py-2.5"
              style={{ borderRadius: R }}
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-maroon flex-1 justify-center py-2.5"
              style={{ borderRadius: R }}
              disabled={loading}
            >
              {loading ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
