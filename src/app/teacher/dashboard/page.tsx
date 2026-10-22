"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navigation/Navbar";
import { api, mmss, needsAuth } from "@/lib/client/api";
import { JoinQrModal } from "@/components/join/JoinQrModal";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { SPEECH_LANGS, speechLang } from "@/lib/languages";
import {
  BookA,
  Plus,
  QrCode,
  Video,
  Radio,
  ArrowRight,
  Upload,
  LogOut,
} from "lucide-react";

type Room = {
  id: string;
  name: string;
  subject_code: string | null;
  room: string | null;
  join_code: string;
  default_source_language: string;
  glossary?: string | null;
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

type Teacher = { id: string; name: string; email: string; institution: string | null; department: string | null };

export default function TeacherDashboardPage() {
  const router = useRouter();
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [qrRoom, setQrRoom] = useState<Room | null>(null);
  const [classrooms, setClassrooms] = useState<Room[]>([]);
  const [lectures, setLectures] = useState<LectureItem[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newSubjectCode, setNewSubjectCode] = useState("");
  const [newRoomVenue, setNewRoomVenue] = useState("");
  const [newSourceLang, setNewSourceLang] = useState("en-IN");
  const [newGlossary, setNewGlossary] = useState("");
  // Edit a classroom's word list
  const [wordsRoom, setWordsRoom] = useState<Room | null>(null);
  const [wordsText, setWordsText] = useState("");
  const [wordsSaving, setWordsSaving] = useState(false);
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
    api<{ teacher: Teacher | null }>("/api/auth/me")
      .then((d) => (d.teacher ? setTeacher(d.teacher) : router.replace("/teacher/login")))
      .catch(() => {});
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
      if (needsAuth(err)) return router.replace("/teacher/login");
      setError((err as Error).message);
    }
  };

  const signOut = async () => {
    await api("/api/auth/logout", { json: {} }).catch(() => {});
    router.replace("/teacher/login");
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
          glossary: newGlossary,
        },
      });
      setClassrooms([data.classroom, ...classrooms]);
      setShowCreateModal(false);
      setNewRoomName("");
      setNewSubjectCode("");
      setNewRoomVenue("");
      setNewGlossary("");
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

  const sttLabel = (code: string) => speechLang(code).short;

  const saveWords = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wordsRoom) return;
    setWordsSaving(true);
    try {
      const data = await api<{ classroom: Room }>(`/api/classrooms/${wordsRoom.id}`, { method: "PATCH", json: { glossary: wordsText } });
      setClassrooms((list) => list.map((r) => (r.id === wordsRoom.id ? { ...r, glossary: data.classroom.glossary } : r)));
      setWordsRoom(null);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setWordsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper pb-24 text-ink">
      <Navbar title="ClassCaption" subtitle="Teacher's desk" homeHref="/teacher/dashboard" />

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome header */}
        <section className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4 pt-2">
          <div>
            <p className="font-[family-name:var(--font-tiro-deva)] text-sindoor text-lg leading-none mb-1" lang="hi">नमस्ते</p>
            <h1 className="text-3xl sm:text-4xl font-normal tracking-tight">
              {teacher?.name ?? "\u00a0"}
            </h1>
            <p className="text-sm text-ink-3 mt-1 flex flex-wrap items-center gap-x-3">
              <span>{teacher ? [teacher.institution, teacher.department].filter(Boolean).join(" · ") || teacher.email : "\u00a0"}</span>
              {teacher && (
                <button onClick={signOut} className="font-semibold text-ink-3 hover:text-sindoor inline-flex items-center gap-1">
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
              )}
            </p>
          </div>

          <button onClick={() => setShowCreateModal(true)} className="cc-btn cc-btn-primary h-11 px-5 text-sm">
            <Plus className="w-4 h-4" />
            <span>New classroom</span>
          </button>
        </section>

        {/* Classrooms List */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="cc-eyebrow">Your classrooms</h2>
            <span className="text-xs font-mono text-ink-3">{classrooms.length}</span>
          </div>

          {error && (
            <p className="text-xs text-sindoor font-semibold">{error}</p>
          )}

          {classrooms.length === 0 && !error && (
            <div className="rounded-card border border-dashed border-rule-strong p-6 text-center text-sm text-ink-2 cc-kolam">
              No classrooms yet. Create one to get a PIN your students can join with.
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {classrooms.map((room) => (
              <div
                key={room.id}
                className="cc-card p-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="cc-stamp text-neel">
                        {room.subject_code || "CLASS"}
                      </span>
                      <span className="cc-stamp text-haldi-deep">
                        PIN: {room.join_code}
                      </span>
                    </div>
                    <h3 className="text-2xl font-normal leading-tight">{room.name}</h3>
                    <p className="text-xs text-ink-2">
                      {room.room || "Classroom"} · Teacher speaks {sttLabel(room.default_source_language)}
                    </p>
                  </div>

                  {room.live_class ? (
                    <Link
                      href={`/teacher/live/${room.live_class.id}`}
                      className="cc-btn cc-btn-sindoor h-12 px-6 text-sm"
                    >
                      <Radio className="w-4 h-4 animate-pulse" />
                      <span>Resume live class</span>
                    </Link>
                  ) : (
                    <button
                      onClick={() => handleStartLiveClass(room.id, `${room.name} - Live Lecture`)}
                      disabled={startingId === room.id}
                      className="cc-btn cc-btn-sindoor h-12 px-6 text-sm"
                    >
                      <Radio className="w-4 h-4 animate-pulse" />
                      <span>{startingId === room.id ? "Starting..." : "Start live class"}</span>
                    </button>
                  )}
                </div>

                <div className="pt-3 border-t border-rule flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Video className="w-3.5 h-3.5 text-neel" />
                    {room.lecture_count} recorded lecture{room.lecture_count === 1 ? "" : "s"}
                    {room.live_class && <span className="text-sindoor font-semibold"> · Live now</span>}
                  </span>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setWordsRoom(room);
                        setWordsText(room.glossary ?? "");
                      }}
                      className="font-semibold text-ink-2 hover:text-neel flex items-center gap-1"
                    >
                      <BookA className="w-3.5 h-3.5" />
                      Word list{room.glossary ? ` (${room.glossary.split("\n").filter(Boolean).length})` : ""}
                    </button>
                    <button
                      onClick={() => setUploadRoom(room)}
                      className="font-semibold text-ink-2 hover:text-neel flex items-center gap-1"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload recording
                    </button>
                    <button
                      onClick={() => setQrRoom(room)}
                      className="font-semibold text-ink-2 hover:text-neel flex items-center gap-1"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      QR &amp; PIN
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Recorded Lectures (uploads + ended live classes) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="cc-eyebrow">Recorded lectures</h2>
            <button
              onClick={() => setUploadRoom(null)}
              className="text-xs font-semibold text-ink-2 hover:text-neel flex items-center gap-1"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload Audio / Video
            </button>
          </div>

          {lectures.length === 0 && (
            <div className="rounded-card border border-dashed border-rule-strong p-6 text-center text-sm text-ink-2 cc-kolam">
              Ended live classes and uploaded recordings appear here with subtitles, AI notes and a quiz.
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            {lectures.map((lec) => (
              <div key={lec.id} className="cc-card p-5 hover:border-rule-strong transition flex items-center justify-between gap-3 group">
                <Link href={`/student/lectures/${lec.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="cc-stamp text-neel">
                      {lec.classroom?.subject_code || (lec.source === "live" ? "LIVE" : "UPLOAD")}
                    </span>
                    <span
                      className={`cc-stamp ${
                        lec.status === "ready" ? "text-patta" : lec.status === "failed" ? "text-sindoor" : "text-haldi-deep"
                      }`}
                    >
                      {lec.status === "ready" ? "Ready" : lec.status === "failed" ? "Failed" : `${lec.status} ${lec.progress ?? 0}%`}
                    </span>
                  </div>
                  <h3 className="text-[15px] font-semibold truncate">{lec.title}</h3>
                  <p className="text-xs text-ink-3">
                    {new Date(lec.created_at).toLocaleString()} {lec.duration_s ? `• ${mmss(lec.duration_s)}` : ""}
                    {lec.error ? ` • ${lec.error.slice(0, 80)}` : ""}
                  </p>
                </Link>
                {lec.source === "live" && (
                  <Link href={`/teacher/insights/${lec.id}`} className="cc-btn h-9 px-3 text-xs flex-shrink-0" title="Confusion spikes, open questions and what to revisit">
                    Report
                  </Link>
                )}
                <Link href={`/student/lectures/${lec.id}`} aria-label={`Open ${lec.title}`} className="flex-shrink-0">
                  <ArrowRight className="w-4 h-4 text-ink-3 group-hover:text-neel group-hover:translate-x-0.5 transition" />
                </Link>
              </div>
            ))}
          </div>
        </section>
      </main>

      {qrRoom && (
        <JoinQrModal
          isOpen
          onClose={() => setQrRoom(null)}
          classroomId={qrRoom.id}
          classroomName={qrRoom.name}
          pin={qrRoom.join_code}
          onPinChange={(pin) => {
            setQrRoom({ ...qrRoom, join_code: pin });
            setClassrooms((prev) => prev.map((r) => (r.id === qrRoom.id ? { ...r, join_code: pin } : r)));
          }}
        />
      )}

      {/* Create Classroom Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40">
          <div className="cc-card p-6 max-w-md w-full space-y-4">
            <h3 className="text-2xl font-normal">New classroom</h3>

            <form onSubmit={handleCreateClassroom} className="space-y-3">
              <div>
                <label className="cc-eyebrow block mb-1.5">
                  Classroom Name
                </label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  required
                  placeholder="e.g. Data Structures & Algorithms"
                  className="cc-input w-full h-11 px-3 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="cc-eyebrow block mb-1.5">
                    Course Code
                  </label>
                  <input
                    type="text"
                    value={newSubjectCode}
                    onChange={(e) => setNewSubjectCode(e.target.value)}
                    placeholder="e.g. CS302"
                    className="cc-input w-full h-11 px-3 text-sm"
                  />
                </div>
                <div>
                  <label className="cc-eyebrow block mb-1.5">
                    Hall / Room
                  </label>
                  <input
                    type="text"
                    value={newRoomVenue}
                    onChange={(e) => setNewRoomVenue(e.target.value)}
                    placeholder="e.g. LH-304"
                    className="cc-input w-full h-11 px-3 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="cc-eyebrow block mb-1.5">
                  Teacher Speaks In
                </label>
                <select
                  value={newSourceLang}
                  onChange={(e) => setNewSourceLang(e.target.value)}
                  className="cc-input w-full h-11 px-3 text-sm"
                >
                  {SPEECH_LANGS.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="cc-eyebrow block mb-1.5">
                  Names &amp; Subject Terms <span className="normal-case font-medium text-ink-4">(optional)</span>
                </label>
                <textarea
                  value={newGlossary}
                  onChange={(e) => setNewGlossary(e.target.value)}
                  rows={3}
                  placeholder={"One per line or comma-separated, e.g.\nDijkstra, AVL tree, Prof. Iyer, NPTEL"}
                  className="cc-input w-full px-3 py-2 text-sm"
                />
                <p className="text-[11px] text-ink-3 mt-1">Captions will always recognise and spell these correctly.</p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-rule">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="cc-btn h-11 px-4 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="cc-btn cc-btn-primary h-11 px-6 text-xs"
                >
                  {loading ? "Creating..." : "Save Classroom"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Word List Modal */}
      {wordsRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40">
          <div className="cc-card p-6 max-w-md w-full space-y-4">
            <div>
              <h3 className="text-2xl font-normal">Word List</h3>
              <p className="text-xs text-ink-3">
                {wordsRoom.name} • Names, subject terms and abbreviations that captions should always get right, even with a strong accent.
                Changes apply to the next caption, even during a live class.
              </p>
            </div>
            <form onSubmit={saveWords} className="space-y-3">
              <textarea
                value={wordsText}
                onChange={(e) => setWordsText(e.target.value)}
                rows={7}
                autoFocus
                placeholder={"One per line or comma-separated, e.g.\nDijkstra\nAVL tree\nProf. Iyer\nNPTEL"}
                className="cc-input w-full px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2 pt-3 border-t border-rule">
                <button type="button" onClick={() => setWordsRoom(null)} className="cc-btn h-11 px-4 text-xs">
                  Cancel
                </button>
                <button type="submit" disabled={wordsSaving} className="cc-btn cc-btn-primary h-11 px-6 text-xs">
                  {wordsSaving ? "Saving..." : "Save Word List"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Recording Modal */}
      {uploadRoom !== undefined && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40">
          <div className="cc-card p-6 max-w-md w-full space-y-4">
            <div>
              <h3 className="text-2xl font-normal">
                Upload Recorded Lecture
              </h3>
              <p className="text-xs text-ink-3">
                {uploadRoom ? uploadRoom.name : "No classroom"} • Audio or video (MP3, M4A, WAV, MP4, WebM)
              </p>
            </div>

            <form onSubmit={handleUpload} className="space-y-3">
              <div>
                <label className="cc-eyebrow block mb-1.5">
                  Lecture Title
                </label>
                <input
                  type="text"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="Lecture 14: Binary Trees"
                  className="cc-input w-full h-11 px-3 text-sm"
                />
              </div>

              <div>
                <label className="cc-eyebrow block mb-1.5">
                  Recording File
                </label>
                <input
                  type="file"
                  accept="audio/*,video/*"
                  required
                  onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-ink-2 file:mr-3 file:h-10 file:px-4 file:rounded-[10px] file:border-[1.5px] file:border-ink file:bg-card file:text-ink file:font-semibold"
                />
              </div>

              {uploadStage && (
                <div className="bg-patta-wash border border-patta-line text-patta-deep rounded-xl p-3 text-xs font-semibold">
                  {uploadStage}
                </div>
              )}
              {uploadError && (
                <p className="text-xs text-sindoor font-semibold">{uploadError}</p>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-rule">
                <button
                  type="button"
                  onClick={closeUpload}
                  className="cc-btn h-11 px-4 text-xs"
                >
                  Close
                </button>
                {uploadedId && (
                  <Link
                    href={`/student/lectures/${uploadedId}`}
                    className="cc-btn h-11 px-4 text-xs"
                  >
                    Open Lecture Hub
                  </Link>
                )}
                <button
                  type="submit"
                  disabled={!uploadFile || (!!uploadStage && !uploadStage.startsWith("Ready"))}
                  className="cc-btn cc-btn-primary h-11 px-6 text-xs"
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
