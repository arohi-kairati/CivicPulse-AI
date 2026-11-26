import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Activity,
  Camera,
  MapPin,
  ShieldAlert,
  CheckCircle2,
  Layers,
  AlertTriangle,
  Search,
  Building2,
} from 'lucide-react';

const API_BASE = 'http://localhost:8000';

const getPriorityColor = (priority) => {
  switch (priority) {
    case 'Critical': return '#dc2626';
    case 'High': return '#ea580c';
    case 'Medium': return '#d97706';
    default: return '#16a34a';
  }
};

const createPinIcon = (priority) => {
  const color = getPriorityColor(priority);
  return L.divIcon({
    className: 'custom-pin',
    html: `<div style="background:${color};width:18px;height:18px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
};

function MapRecenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, 15);
    }
  }, [center, map]);
  return null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('citizen');
  const [reports, setReports] = useState([]);
  const [demoLocations, setDemoLocations] = useState([]);
  const [deptFilter, setDeptFilter] = useState('All');
  const [searchId, setSearchId] = useState('');

  // Form states
  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [lat, setLat] = useState('26.8467');
  const [lng, setLng] = useState('80.9462');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  const fetchReports = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/reports`);
      const data = await res.json();
      setReports(data);
    } catch (err) {
      console.error('Failed to fetch reports:', err);
    }
  };

  const fetchDemoLocations = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/demo-locations`);
      const data = await res.json();
      setDemoLocations(data);
      if (data.length > 0) {
        setLat(String(data[0].lat));
        setLng(String(data[0].lng));
      }
    } catch (err) {
      console.error('Failed to fetch demo locations:', err);
    }
  };

  useEffect(() => {
    fetchReports();
    fetchDemoLocations();
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handlePresetChange = (e) => {
    const idx = e.target.value;
    if (idx !== '' && demoLocations[idx]) {
      setLat(String(demoLocations[idx].lat));
      setLng(String(demoLocations[idx].lng));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!imageFile) {
      alert('Please select an issue photo first.');
      return;
    }
    setSubmitting(true);
    setSubmitResult(null);

    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('lat', parseFloat(lat));
    formData.append('lng', parseFloat(lng));
    formData.append('description', description);

    try {
      const res = await fetch(`${API_BASE}/api/reports`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setSubmitResult(data);
      await fetchReports();
    } catch (err) {
      alert('Error submitting report. Check if backend is running on port 8000.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await fetch(`${API_BASE}/api/reports/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchReports();
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const filteredReports = reports.filter((r) => {
    if (deptFilter !== 'All' && r.department !== deptFilter) return false;
    return true;
  });

  const trackedReports = reports.filter((r) =>
    r.id.toLowerCase().includes(searchId.trim().toLowerCase())
  );

  const totalReports = reports.length;
  const highCriticalCount = reports.filter(
    (r) => r.priority === 'High' || r.priority === 'Critical'
  ).length;
  const mergedDuplicates = reports.reduce(
    (sum, r) => sum + Math.max(0, (r.duplicate_count || 1) - 1),
    0
  );
  const resolvedCount = reports.filter((r) => r.status === 'Resolved').length;

  const mapCenter = [parseFloat(lat) || 26.8467, parseFloat(lng) || 80.9462];

  return (
    <div>
      <nav className="navbar">
        <div className="brand">
          <Activity size={26} color="#3b82f6" />
          <span>CivicPulse AI</span>
        </div>
        <div className="nav-tabs">
          <button
            className={`tab-btn ${activeTab === 'citizen' ? 'active' : ''}`}
            onClick={() => setActiveTab('citizen')}
          >
            <Camera size={16} /> Citizen Portal
          </button>
          <button
            className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            <Building2 size={16} /> Authority Dashboard
          </button>
        </div>
      </nav>

      <div className="container">
        {activeTab === 'citizen' ? (
          <div className="grid-2">
            {/* Left Column: Report Form */}
            <div>
              <div className="card">
                <h2>
                  <Camera size={20} color="#2563eb" /> Report a Civic Issue
                </h2>
                <form onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label>Upload Issue Photo</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="input"
                    />
                    {previewUrl && (
                      <img src={previewUrl} alt="Preview" className="preview-img" />
                    )}
                  </div>

                  <div className="form-group">
                    <label>Quick Demo Location (Venue Coordinates)</label>
                    <select className="select" onChange={handlePresetChange} defaultValue="0">
                      {demoLocations.map((loc, idx) => (
                        <option key={idx} value={idx}>
                          {loc.label} ({loc.lat}, {loc.lng})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="row-2 form-group">
                    <div>
                      <label>Latitude</label>
                      <input
                        type="number"
                        step="any"
                        value={lat}
                        onChange={(e) => setLat(e.target.value)}
                        className="input"
                        required
                      />
                    </div>
                    <div>
                      <label>Longitude</label>
                      <input
                        type="number"
                        step="any"
                        value={lng}
                        onChange={(e) => setLng(e.target.value)}
                        className="input"
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Additional Note (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g., Large pothole near school gate"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="input"
                    />
                  </div>

                  <button type="submit" className="btn-primary" disabled={submitting}>
                    {submitting ? 'AI Analyzing & Routing...' : 'Submit Issue Report'}
                  </button>
                </form>

                {submitResult && submitResult.complaint && (
                  <div className={`alert-box ${submitResult.merged ? 'merged' : ''}`}>
                    <div style={{ fontWeight: 700, marginBottom: '0.4rem', fontSize: '1rem' }}>
                      {submitResult.merged
                        ? `Duplicate Merged into ${submitResult.complaint.id} (Count: ${submitResult.complaint.duplicate_count})`
                        : `New Ticket Created: ${submitResult.complaint.id}`}
                    </div>
                    <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                      {submitResult.complaint.summary}
                    </p>
                    <div>
                      <span className={`badge prio-${submitResult.complaint.priority}`}>
                        {submitResult.complaint.priority} (Severity {submitResult.complaint.severity}/10)
                      </span>
                      <span className="badge tag-dept" style={{ marginLeft: '0.4rem' }}>
                        Dept: {submitResult.complaint.department}
                      </span>
                      {submitResult.complaint.sensitive_zone && (
                        <span className="badge tag-sensitive">Sensitive Zone (+2)</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Map & Status Tracker */}
            <div>
              <div className="card">
                <h2>
                  <MapPin size={20} color="#2563eb" /> Nearby Reported Issues
                </h2>
                <div className="map-box">
                  <MapContainer center={mapCenter} zoom={15} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                      attribution='© OpenStreetMap contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapRecenter center={mapCenter} />
                    {reports.map((r) => (
                      <Marker key={r.id} position={[r.lat, r.lng]} icon={createPinIcon(r.priority)}>
                        <Popup>
                          <strong>{r.id}</strong> — {r.issue_type.toUpperCase()}
                          <br />
                          Priority: <b>{r.priority}</b> | Dept: {r.department}
                          <br />
                          Status: <b>{r.status}</b>
                        </Popup>
                      </Marker>
                    ))}
                  </MapContainer>
                </div>
              </div>

              <div className="card">
                <h2>
                  <Search size={20} color="#2563eb" /> Track Complaint Status
                </h2>
                <div className="form-group">
                  <input
                    type="text"
                    placeholder="Search by Complaint ID (e.g., CP-1001)..."
                    value={searchId}
                    onChange={(e) => setSearchId(e.target.value)}
                    className="input"
                  />
                </div>
                <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                  {trackedReports.map((r) => (
                    <div key={r.id} className="tracker-item">
                      <div>
                        <strong>{r.id}</strong> •{' '}
                        <span style={{ textTransform: 'capitalize' }}>
                          {r.issue_type.replace('_', ' ')}
                        </span>
                        <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '2px' }}>
                          {r.summary}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className={`badge prio-${r.priority}`}>{r.priority}</span>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, marginTop: '4px' }}>
                          {r.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* AUTHORITY DASHBOARD */
          <div>
            <div className="kpi-grid">
              <div className="kpi-card">
                <div style={{ color: '#64748b', fontSize: '0.85rem', fontWeight: 600 }}>
                  Total Active Tickets
                </div>
                <div className="num">{totalReports}</div>
              </div>
              <div className="kpi-card">
                <div style={{ color: '#dc2626', fontSize: '0.85rem', fontWeight: 600 }}>
                  High / Critical Priority
                </div>
                <div className="num">{highCriticalCount}</div>
              </div>
              <div className="kpi-card">
                <div style={{ color: '#4f46e5', fontSize: '0.85rem', fontWeight: 600 }}>
                  Duplicate Reports Merged
                </div>
                <div className="num">{mergedDuplicates}</div>
              </div>
              <div className="kpi-card">
                <div style={{ color: '#16a34a', fontSize: '0.85rem', fontWeight: 600 }}>
                  Resolved Issues
                </div>
                <div className="num">{resolvedCount}</div>
              </div>
            </div>

            <div className="card">
              <h2>
                <MapPin size={20} color="#dc2626" /> Live City Issue Heatmap & Pins
              </h2>
              <div className="map-box">
                <MapContainer center={mapCenter} zoom={14} style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    attribution='© OpenStreetMap contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {reports.map((r) => (
                    <Marker key={r.id} position={[r.lat, r.lng]} icon={createPinIcon(r.priority)}>
                      <Popup>
                        <strong>{r.id}</strong> ({r.department})
                        <br />
                        {r.summary}
                        <br />
                        Severity: <b>{r.severity}/10</b> ({r.priority})
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            </div>

            <div className="card">
              <h2>
                <ShieldAlert size={20} color="#ea580c" /> Priority-Sorted Department Queue
              </h2>
              <div className="filter-bar">
                {['All', 'Roads', 'Sanitation', 'Water', 'Electricity'].map((dept) => (
                  <button
                    key={dept}
                    className={`pill ${deptFilter === dept ? 'active' : ''}`}
                    onClick={() => setDeptFilter(dept)}
                  >
                    {dept}
                  </button>
                ))}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Ticket</th>
                      <th>Photo</th>
                      <th>Issue & AI Summary</th>
                      <th>Department</th>
                      <th>Priority & Signals</th>
                      <th>Live Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReports.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.id}</strong>
                        </td>
                        <td>
                          {r.image_url ? (
                            <img
                              src={`${API_BASE}${r.image_url}`}
                              alt={r.issue_type}
                              className="thumb"
                            />
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Seed Data</span>
                          )}
                        </td>
                        <td>
                          <strong style={{ textTransform: 'capitalize' }}>
                            {r.issue_type.replace('_', ' ')}
                          </strong>
                          <div style={{ fontSize: '0.83rem', color: '#475569' }}>{r.summary}</div>
                        </td>
                        <td>
                          <span className="badge tag-dept">{r.department}</span>
                        </td>
                        <td>
                          <span className={`badge prio-${r.priority}`}>
                            {r.priority} ({r.severity}/10)
                          </span>
                          {r.duplicate_count > 1 && (
                            <span className="badge tag-dupe">
                              <Layers size={11} style={{ marginRight: 3 }} />
                              {r.duplicate_count} Merged
                            </span>
                          )}
                          {r.sensitive_zone && (
                            <span className="badge tag-sensitive">
                              <AlertTriangle size={11} style={{ marginRight: 3 }} />
                              Sensitive Zone
                            </span>
                          )}
                        </td>
                        <td>
                          <select
                            className="select"
                            value={r.status}
                            onChange={(e) => handleStatusChange(r.id, e.target.value)}
                            style={{ width: '135px', padding: '0.35rem' }}
                          >
                            <option value="Pending">Pending</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Resolved">Resolved</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}