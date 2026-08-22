import React, { useState } from 'react';
import { X, Upload, Trash2 } from 'lucide-react';
import ConfirmModal from './ConfirmModal';

export default function EditBuildingModal({ building, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    name: building?.name || '',
    prefix: building?.prefix || building?.code || '',
    image: building?.image || '',
    floors: building?.floorData?.length
      ? building.floorData.map((f) => f.label || `Floor ${f.floor}`)
      : Array.from({ length: building?.floors || 1 }, (_, i) => `Floor ${i + 1}`),
  });
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
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

  const handleExecuteDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setError('');
    try {
      await onDelete(building.id);
      setShowDeleteModal(false);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to delete building.');
      setShowDeleteModal(false);
    } finally {
      setDeleting(false);
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
                  type="text"
                  required
                  className="form-input text-xs font-medium"
                  placeholder="e.g. Science Building"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div>
                <label className="form-label font-bold text-gray-700">
                  Room Prefix <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  className="form-input text-xs font-medium uppercase tracking-wider"
                  placeholder="e.g. SCI"
                  value={form.prefix}
                  onChange={(e) => setForm((f) => ({ ...f, prefix: e.target.value.toUpperCase() }))}
                />
                <p className="text-[10px] text-gray-400 mt-1">Short code used for rooms (e.g. {form.prefix || 'SCI'}-101)</p>
              </div>
            </div>

            {/* Building Photo Upload */}
            <div>
              <label className="form-label font-bold text-gray-700">
                Building Photo <span className="text-red-500">*</span>
              </label>
              <div className="mt-1 flex items-center gap-3">
                {form.image ? (
                  <div className="relative group w-20 h-20 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0 bg-gray-50">
                    <img src={form.image} alt="Building Preview" className="w-full h-full object-cover" />
                    <label
                      htmlFor="building-image-edit-input"
                      className="absolute inset-0 bg-black/50 text-white text-[10px] font-bold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-center p-1"
                    >
                      Change Photo
                    </label>
                  </div>
                ) : (
                  <label
                    htmlFor="building-image-edit-input"
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 hover:border-[#7A0808] bg-gray-50 hover:bg-red-50/50 flex flex-col items-center justify-center text-gray-400 hover:text-[#7A0808] cursor-pointer transition-colors flex-shrink-0"
                  >
                    <Upload size={18} />
                    <span className="text-[10px] font-bold mt-1">Upload</span>
                  </label>
                )}
                <input
                  type="file"
                  id="building-image-edit-input"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <div className="text-[11px] text-gray-500">
                  <p className="font-semibold text-gray-700">Upload building banner</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">PNG, JPG, WebP up to 5MB.</p>
                </div>
              </div>
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

            <div className="flex items-center justify-between gap-2 pt-3 border-t border-gray-100">
              {onDelete && (
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="px-3 py-2.5 text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="Delete this building"
                  disabled={loading || deleting}
                >
                  <Trash2 size={14} /> Delete
                </button>
              )}
              <div className="flex gap-2 flex-1 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-outline-maroon px-4 py-2.5 font-bold"
                  style={{ borderRadius: 10 }}
                  disabled={loading || deleting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-maroon px-5 py-2.5 font-bold shadow-md"
                  style={{ borderRadius: 10 }}
                  disabled={loading || deleting}
                >
                  {loading ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <ConfirmModal
          title="Delete Building"
          message={`Are you sure you want to delete "${building.name}"? This will permanently delete all floors and rooms inside this building. This action cannot be undone.`}
          confirmText="Yes, Delete Building"
          cancelText="Cancel"
          variant="danger"
          isProcessing={deleting}
          onConfirm={handleExecuteDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </>
  );
}
