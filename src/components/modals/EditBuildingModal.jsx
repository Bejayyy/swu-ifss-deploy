import React, { useState } from 'react';
import { X, Upload } from 'lucide-react';

const R = 10;

export default function EditBuildingModal({ building, onClose, onSave }) {
  const [form, setForm] = useState({
    name: building?.name || '',
    prefix: building?.prefix || building?.code || '',
    image: building?.image || '',
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

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await onSave(building.id, {
        name: form.name.trim() || building.name,
        prefix: form.prefix.trim().toUpperCase() || building.prefix || building.code,
        image: form.image,
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
                  <Upload size={18} className="text-gray-400" />
                  <span className="text-xs font-semibold text-gray-600">Upload building image</span>
                  <span className="text-[10px] text-gray-400">PNG, JPG, WEBP up to 5MB</span>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
            )}
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
