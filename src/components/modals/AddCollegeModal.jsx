import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { addCollege } from '../../services/collegeService';

export default function AddCollegeModal({ onClose, onSaveSuccess, colleges = [] }) {
  const [form, setForm] = useState({ code: '', name: '', description: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const code = form.code.trim().toUpperCase();
    const name = form.name.trim();

    if (!code || !name) {
      setError('College code and name are required.');
      return;
    }

    const duplicate = colleges.find((c) => c.code.toLowerCase() === code.toLowerCase());
    if (duplicate) {
      setError(`A college with code "${code}" already exists.`);
      return;
    }

    setLoading(true);
    try {
      await addCollege({
        code,
        name,
        description: form.description.trim(),
      });
      if (onSaveSuccess) {
        onSaveSuccess(code);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to add college.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay z-[100]" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 relative animate-modal-pop" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-black text-lg" style={{ color: '#2B3235' }}>Add New College</h3>
            <p className="text-xs text-gray-500 mt-0.5">Add a new college to the institution</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs font-semibold text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
              College Code <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="e.g., CAS, CEIT, CON"
              className="form-input w-full"
              maxLength={10}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
              College Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., College of Arts and Sciences"
              className="form-input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-2" style={{ color: '#2B3235' }}>
              Description (Optional)
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Brief description of the college..."
              className="form-input w-full"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-4 border-t border-gray-100">
            <button type="button" onClick={onClose} className="btn-outline-maroon flex-1 justify-center py-2.5" disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-maroon flex-1 flex items-center justify-center gap-2 py-2.5" disabled={loading}>
              <Plus size={16} /> {loading ? 'Adding...' : 'Add College'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
