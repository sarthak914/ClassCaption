"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navigation/Navbar";
import { api, mmss } from "@/lib/client/api";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  Plus,
  Play,
  QrCode,
  Users,
  Video,
  Radio,
  BookOpen,
  ArrowRight,
  Sparkles,
  Layers,
  Upload,
} from "lucide-react";

type Room = {
  id: string;
  name: string;
  subject_code: string | null;
  room: string | null;
  join_code: string;
  default_source_language: string;
  live_class: { id: string; title: string; started_at: string } | null;
  lecture_count: number;
};

type LectureItem = {
  id: string;
  title: string;
  source: "upload" | "live";
  status: string;
  progress: number;
  duration_s: number | null;
  created_at: string;
  error: string | null;
  classroom: { name: string; subject_code: string | null } | null;
};

export default function TeacherDashboardPage() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<Room[]>([]);
  const [lectures, setLectures] = useState<LectureItem[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState("CS302: Data Structures & Algorithms");
  const [newSubjectCode, setNewSubjectCode] = useState("CS302");
  const [newRoomVenue, setNewRoomVenue] = useState("Lecture Hall 304");
  const [newSourceLang, setNewSourceLang] = useState("en-IN");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [startingId, setStartingId] = useState<string | null>(null);

  // Upload a recorded lecture (audio or video) → subtitles, notes, quiz
  const [uploadRoom, setUploadRoom] = useState<Room | null | undefined>(undefined);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadStage, setUploadStage] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [uploadedId, setUploadedId] = useState<string | null>(null);

  useEffect(() => {
    fetchClassrooms();
    fetchLectures();
    const t = setInterval(fetchLectures, 5000);
    return () => clearInterval(t);
  }, []);

  const fetchClassrooms = async () => {
    try {
      const data = await api<{ classrooms: Room[] }>("/api/classrooms");
      setClassrooms(data.classrooms);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const fetchLectures = async () => {
    try {
      const data = await api<{ lectures: LectureItem[] }>("/api/lectures");
      setLectures(data.lectures.slice(0, 8));
    } catch {}
  };

  const handleCreateClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api<{ classroom: Room }>("/api/classrooms", {
        json: {
          name: newRoomName,
          subject_code: newSubjectCode,
          room: newRoomVenue,
          default_source_language: newSourceLang,
        },
      });
      setClassrooms([data.classroom, ...classrooms]);
      setShowCreateModal(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartLiveClass = async (classroomId: string, title: string) => {
    setStartingId(classroomId);
    try {
      const data = await api<{ class: { id: string } }>("/api/class/start", {
        json: { classroomId, title },
      });
      router.push(`/teacher/live/${data.class.id}`);
    } catch (err) {
      alert((err as Error).message);
      setStartingId(null);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setUploadError("");
    setUploadedId(null);
    try {
      setUploadStage("Creating lecture...");
      const created = await api<{ lecture: { id: string }; upload: { path: string; token: string; bucket: string } }>("/api/lectures", {
        json: {
          title: uploadTitle || uploadFile.name.replace(/\.[^.]+$/, ""),
          filename: uploadFile.name,
          contentType: uploadFile.type,
          classroomId: uploadRoom?.id,
        },
      });
      setUploadStage(`Uploading ${(uploadFile.size / 1048576).toFixed(1)} MB...`);
      const { error: upErr } = await supabaseBrowser()
        .storage.from(created.upload.bucket)
        .uploadToSignedUrl(created.upload.path, created.upload.token, uploadFile, { contentType: uploadFile.type || undefined });
      if (upErr) throw new Error(upErr.message);
      setUploadedId(created.lecture.id);
      setUploadStage("Transcribing with Whisper and writing notes...");
      fetchLectures();
      await api(`/api/lectures/${created.lecture.id}/process`, { method: "POST" });
      setUploadStage("Ready! Subtitles, notes and quiz are available.");
      fetchLectures();
      fetchClassrooms();
    } catch (err) {
      setUploadError((err as Error).message);
      setUploadStage("");
      fetchLectures();
    }
  };

  const closeUpload = () => {
    setUploadRoom(undefined);
    setUploadFile(null);
    setUploadTitle("");
    setUploadStage("");
    setUploadError("");
    setUploadedId(null);
  };

  const sttLabel = (code: string) => (code.startsWith("hi") ? "Hindi" : code === "en-IN" ? "Hinglish / English" : "English");

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 text-[#0F172A]">
      <Navbar title="ClassCaption" subtitle="Instructor Portal" />

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome Header Banner */}
        <section className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#1E3A8A] mb-1">
              <span className="w-2 h-2 rounded-full bg-[#059669]" />
              <span>Academic Instructor Console</span>
            </div>
            <h1 className="text-2xl font-extrabold text-[#0F172A] font-heading">
              Prof. R. Sharma
            </h1>
            <p className="text-xs text-[#64748B]">
              IIT Delhi • Department of Computer Science &amp; Engineering
            </p>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="h-12 px-5 rounded-2xl bg-[#1E3A8A] hover:bg-[#00236F] text-white font-bold text-sm flex items-center gap-2 shadow-sm transition active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Create Classroom</span>
          </button>
        </section>

        {/* Classrooms List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#0F172A] font-heading">
              Your Active Classrooms
            </h2>
            <span className="text-xs font-semibold text-[#64748B]">
              {classrooms.length} Classrooms
            </span>
          </div>

          {error && (
            <p className="text-xs text-[#DC2626] font-semibold">{error}</p>
          )}

          {classrooms.length === 0 && !error && (
            <div className="bg-white rounded-3xl border border-dashed border-[#CBD5E1] p-6 text-center text-sm text-[#475569]">
              No classrooms yet. Create one to get a PIN your students can join with.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {classrooms.map((room) => (
              <div
                key={room.id}
                className="bg-white rounded-3xl border border-[#E2E8F0] p-6 shadow-xs hover:border-[#94A3B8] transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="px-2.5 py-0.5 rounded-md bg-[#EFF6FF] text-[#1E40AF] font-bold text-xs">
                        {room.subject_code || "CLASS"}
                      </span>
                      <span className="text-xs font-mono font-bold bg-[#FEF3C7] text-[#92400E] px-2 py-0.5 rounded-md">
                        PIN: {room.join_code}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-[#0F172A] font-heading">
                      {room.name}
                    </h3>
                    <p className="text-xs text-[#475569]">
                      {room.room || "Classroom"} • Default STT: {sttLabel(room.default_source_language)}
                    </p>
                  </div>

                  {room.live_class ? (
                    <Link
                      href={`/teacher/live/${room.live_class.id}`}
                      className="h-12 px-6 rounded-2xl bg-[#059669] hover:bg-[#047857] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
                    >
                      <Radio className="w-4 h-4 animate-pulse" />
                      <span>Resume Live Class</span>
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleStartLiveClass(room.id, `${room.name} - Live Lecture`)}
                      disabled={startingId === room.id}
                      className="h-12 px-6 rounded-2xl bg-[#059669] hover:bg-[#047857] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition active:scale-95 disabled:opacity-60"
                    >
                      <Radio className="w-4 h-4 animate-pulse" />
                      <span>{startingId === room.id ? "Starting..." : "Start Live Class"}</span>
                    </button>
                  )}
                </div>

                <div className="pt-3 border-t border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Video className="w-3.5 h-3.5 text-[#1E3A8A]" />
                    {room.lecture_count} Recorded Lecture{room.lecture_count === 1 ? "" : "s"}
                    {room.live_class && <span className="text-[#059669] font-bold"> • Live now</span>}
                  </span>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setUploadRoom(room)}
                      className="font-bold text-[#1E3A8A] hover:underline flex items-center gap-1"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload Recording
                    </button>
                    <Link
                      href={`/student/live/classroom-${room.id}`}
                      className="font-bold text-[#1E3A8A] hover:underline"
                    >
                      Open Student View →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recorded Lectures (uploads + ended live classes) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#0F172A] font-heading">
              Recorded Lectures
            </h2>
            <button
              onClick={() => setUploadRoom(null)}
              className="text-xs font-bold text-[#1E3A8A] hover:underline flex items-center gap-1"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Audio / Video
            </button>
          </div>

          {lectures.length === 0 && (
            <div className="bg-white rounded-3xl border border-dashed border-[#CBD5E1] p-6 text-center text-sm text-[#475569]">
              Ended live classes and uploaded recordings appear here with subtitles, AI notes and a quiz.
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            {lectures.map((lec) => (
              <Link
                key={lec.id}
                href={`/student/lectures/${lec.id}`}
                className="bg-white rounded-3xl border border-[#E2E8F0] p-5 shadow-xs hover:border-[#94A3B8] transition flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded-md bg-[#EFF6FF] text-[#1E40AF] font-bold text-xs">
                      {lec.classroom?.subject_code || (lec.source === "live" ? "LIVE" : "UPLOAD")}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                        lec.status === "ready"
                          ? "bg-[#ECFDF5] text-[#065F46]"
                          : lec.status === "failed"
                          ? "bg-[#FEF2F2] text-[#DC2626]"
                          : "bg-[#FEF3C7] text-[#92400E]"
                      }`}
                    >
                      {lec.status === "ready" ? "Ready" : lec.status === "failed" ? "Failed" : `${lec.status} ${lec.progress ?? 0}%`}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-[#0F172A] font-heading truncate">{lec.title}</h3>
                  <p className="text-xs text-[#64748B]">
                    {new Date(lec.created_at).toLocaleString()} {lec.duration_s ? `• ${mmss(lec.duration_s)}` : ""}
                    {lec.error ? ` • ${lec.error.slice(0, 80)}` : ""}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-[#1E3A8A] flex-shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      </main>

      {/* Create Classroom Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#CBD5E1] p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-xl font-bold text-[#0F172A] font-heading">
              Create New Classroom
            </h3>

            <form onSubmit={handleCreateClassroom} className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#475569] block mb-1">
                  Classroom Name
                </label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  required
                  className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#475569] block mb-1">
                    Course Code
                  </label>
                  <input
                    type="text"
                    value={newSubjectCode}
                    onChange={(e) => setNewSubjectCode(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-[#475569] block mb-1">
                    Hall / Room
                  </label>
                  <input
                    type="text"
                    value={newRoomVenue}
                    onChange={(e) => setNewRoomVenue(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#475569] block mb-1">
                  Teacher Speaks In
                </label>
                <select
                  value={newSourceLang}
                  onChange={(e) => setNewSourceLang(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm"
                >
                  <option value="en-IN">Hinglish / Indian English</option>
                  <option value="hi-IN">Hindi</option>
                  <option value="en-US">English (US)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="h-11 px-4 rounded-xl border border-[#E2E8F0] text-[#475569] font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="h-11 px-6 rounded-xl bg-[#1E3A8A] text-white font-bold text-xs"
                >
                  {loading ? "Creating..." : "Save Classroom"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Recording Modal */}
      {uploadRoom !== undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-[#CBD5E1] p-6 max-w-md w-full shadow-2xl space-y-4">
            <div>
              <h3 className="text-xl font-bold text-[#0F172A] font-heading">
                Upload Recorded Lecture
              </h3>
              <p className="text-xs text-[#64748B]">
                {uploadRoom ? uploadRoom.name : "No classroom"} • Audio or video (MP3, M4A, WAV, MP4, WebM)
              </p>
            </div>

            <form onSubmit={handleUpload} className="space-y-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#475569] block mb-1">
                  Lecture Title
                </label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Lecture 14: Binary Trees"
                  className="w-full h-11 px-3 rounded-xl border border-[#CBD5E1] bg-white text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-[#475569] block mb-1">
                  Recording File
                </label>
                <input
                  type="file"
                  accept="audio/*,video/*"
                  required
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-[#475569] file:mr-3 file:h-10 file:px-4 file:rounded-xl file:border-0 file:bg-[#EFF6FF] file:text-[#1E3A8A] file:font-bold"
                />
              </div>

              {uploadStage && (
                <div className="bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] rounded-xl p-3 text-xs font-semibold">
                  {uploadStage}
                </div>
              )}
              {uploadError && (
                <p className="text-xs text-[#DC2626] font-semibold">{uploadError}</p>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={closeUpload}
                  className="h-11 px-4 rounded-xl border border-[#E2E8F0] text-[#475569] font-bold text-xs"
                >
                  Close
                </button>
                {uploadedId && (
                  <Link
                    href={`/student/lectures/${uploadedId}`}
                    className="h-11 px-4 rounded-xl border border-[#1E3A8A] text-[#1E3A8A] font-bold text-xs flex items-center"
                  >
                    Open Lecture Hub
                  </Link>
                )}
                <button
                  type="submit"
                  disabled={!uploadFile || (!!uploadStage && !uploadStage.startsWith("Ready"))}
                  className="h-11 px-6 rounded-xl bg-[#1E3A8A] text-white font-bold text-xs disabled:opacity-50"
                >
                  {uploadStage && !uploadStage.startsWith("Ready") ? "Processing..." : "Upload & Process"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
