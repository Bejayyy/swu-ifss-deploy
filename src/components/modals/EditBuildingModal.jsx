import React, { useState } from 'react';
import { X, Upload } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

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
  const [showConfirmModal, setShowConfirmModal] = useState(false);
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
      setError('');
    };
    reader.readAsDataURL(file);
  };

  const addFloorRow = () =>
    setForm((f) => ({ ...f, floors: [...f.floors, `Floor ${f.floors.length + 1}`] }));

  const handleInitialSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Building name is required.');
      return;
    }
    if (!form.prefix.trim()) {
      setError('Building prefix is required.');
      return;
    }
    if (!form.image) {
      setError('Building image is required. Please upload a building photo.');
      return;
    }
    setError('');
    setShowConfirmModal(true);
  };

  const handleExecuteSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      await onSave(building.id, {
        name: form.name.trim(),
        prefix: form.prefix.trim().toUpperCase(),
        image: form.image,
        floorNames: form.floors,
      });
      setShowConfirmModal(false);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update building.');
      setShowConfirmModal(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
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
          <form onSubmit={handleInitialSubmit} className="p-5 space-y-4 text-xs">
            {error && (
              <p className="text-xs font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label font-bold text-gray-700">
                  Building Name <span className="text-red-500">*</span>
                </label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="form-label font-bold text-gray-700">
                  Building Prefix <span className="text-red-500">*</span>
                </label>
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

            {/* Building Image (Required) */}
            <div>
              <label className="form-label font-bold text-gray-700">
                Building Image / Photo <span className="text-red-500">*</span>
              </label>
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
                <label className={`flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all bg-gray-50/50 mb-3 ${
                  error && !form.image ? 'border-red-400 bg-red-50/50' : 'border-gray-200 hover:border-[#7A0808]'
                }`}>
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-10 h-10 rounded-full bg-red-50 text-[#7A0808] flex items-center justify-center mb-1">
                      <Upload size={18} />
                    </div>
                    <span className="text-xs font-bold text-gray-700">Click to upload building photo</span>
                    <span className="text-[10px] text-gray-400">PNG, JPG, WEBP up to 5MB (Required)</span>
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} required />
                </label>
              )}
            </div>

            {/* Floors Section */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <label className="form-label font-bold text-gray-700 mb-0">Floors ({form.floors.length} total)</label>
                <button
                  type="button"
                  onClick={addFloorRow}
                  className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  + Add Floor
                </button>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-outline-maroon flex-1 justify-center py-2.5 font-bold"
                style={{ borderRadius: 10 }}
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-maroon flex-1 justify-center py-2.5 font-bold shadow-md"
                style={{ borderRadius: 10 }}
                disabled={loading}
              >
                {loading ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <ConfirmModal
          title="Confirm Building Update"
          message={`Are you sure you want to save changes for building "${form.name}"?`}
          confirmText="Yes, Save Changes"
          cancelText="Cancel"
          variant="primary"
          isProcessing={loading}
          onConfirm={handleExecuteSubmit}
          onCancel={() => setShowConfirmModal(false)}
        />
      )}
    </>
  );
}
