import React, { useState } from 'react';
import { X, Plus, Minus, Upload, Image as ImageIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';

export default function AddBuildingModal({ onClose }) {
  const { addBuilding, currentUser } = useApp();
  const [form, setForm] = useState({ name: '', manager: '', floors: ['Floor 1'], image: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isRegistrar = currentUser?.role === 'registrar';

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

  const generatePrefix = (val) => {
    const words = val.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) return words.map((w) => w[0]).join('').toUpperCase();
    return val.slice(0, 3).toUpperCase();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Building name is required.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await addBuilding({
        name: form.name,
        prefix: form.prefix || generatePrefix(form.name),
        floorNames: form.floors,
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
      <div className="bg-white rounded-2xl w-full max-w-md p-7 relative max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onClose} className="absolute right-5 top-5 text-gray-400 hover:text-gray-700">
          <X size={20} />
        </button>
        <h2 className="text-xl font-black mb-1" style={{ color: '#7A0808' }}>Add New Building</h2>
        <p className="text-xs text-gray-400 mb-6">Create a new building and specify its prefix, image, and floors.</p>

        {error && (
          <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="form-label">Building Name</label>
              <input
                className="form-input"
                placeholder="e.g., Phinma Hall"
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
              <label className="form-label">Building Prefix</label>
              <input
                className="form-input"
                placeholder="e.g., PH"
                value={form.prefix}
                onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value.toUpperCase(), prefixCustom: true }))}
                required
              />
              <p className="text-[10px] text-gray-400 mt-1">Used for rooms (e.g. PH - 101)</p>
            </div>
          </div>

          {/* Building Image Upload */}
          <div className="mb-4">
            <label className="form-label">Building Image</label>
            {form.image ? (
              <div className="relative rounded-xl overflow-hidden h-36 border border-gray-200 group mb-2">
                <img src={form.image} alt="Building preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, image: '' }))}
                  className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-lg opacity-90 hover:opacity-100 transition-opacity"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-[#7A0808] transition-colors bg-gray-50/50">
                <div className="flex flex-col items-center gap-1">
                  <Upload size={20} className="text-gray-400" />
                  <span className="text-xs font-semibold text-gray-600">Click to upload building image</span>
                  <span className="text-[10px] text-gray-400">PNG, JPG, WEBP up to 5MB</span>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            )}
          </div>

          <div className="mb-6">
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
            <div className="space-y-2 max-h-44 overflow-y-auto">
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

          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="btn-outline-maroon flex-1" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-maroon flex-1 justify-center" disabled={loading}>
              {loading ? 'Creating…' : 'Create Building'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
