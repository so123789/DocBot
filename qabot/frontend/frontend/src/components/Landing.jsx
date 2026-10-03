import UploadCard from './UploadCard'
import { BoltIcon, BookIcon, ChatIcon, CheckIcon, Logo, ScanIcon, SparkleIcon } from './Icons'

const FEATURES = [
  {
    icon: SparkleIcon,
    tone: 'violet',
    title: 'Instant summaries',
    body: 'Get an overview, key topics and important details from long PDFs in seconds.',
  },
  {
    icon: ChatIcon,
    tone: 'amber',
    title: 'Ask anything',
    body: 'Chat with your document and get answers grounded in the text, with page citations.',
  },
  {
    icon: ScanIcon,
    tone: 'mint',
    title: 'Reads scans & images',
    body: 'Built-in OCR pulls text from scanned pages, photos, and pictures inside PDFs and Word files.',
  },
]

const STEPS = [
  { title: 'Upload a file', body: 'PDFs, Word documents, scans or photos of your notes.' },
  { title: 'We read & index it', body: 'Text is extracted (with OCR for images), split into passages and embedded.' },
  { title: 'Learn faster', body: 'Summarize it, or ask questions and jump to the source page.' },
]

export default function Landing({ onUpload, uploading, progress, serverError }) {
  return (
    <div className="landing">
      <div className="blob blob-a" aria-hidden="true" />
      <div className="blob blob-b" aria-hidden="true" />

      <header className="nav">
        <a className="brand" href="#top" aria-label="DocBot home">
          <Logo size={34} />
          <span>DocBot</span>
        </a>
        <nav className="nav-links" aria-label="Sections">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
        </nav>
        <a className="btn btn-dark btn-sm" href="#upload">Get started</a>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <span className="pill">
              <BoltIcon size={14} /> Powered by Claude Sonnet 5.5
            </span>
            <h1>
              Summarize & study <span className="hl">any document</span> in seconds
            </h1>
            <p className="lead">
              Drop in a PDF, Word file, scan or photo of your notes. DocBot reads it — even text inside images — writes
              a clear summary and answers your questions, with page citations to back it up.
            </p>
            <ul className="hero-checks">
              <li><CheckIcon size={16} /> PDF, Word & images</li>
              <li><CheckIcon size={16} /> OCR for scans</li>
              <li><CheckIcon size={16} /> Page-level citations</li>
              
            </ul>
          </div>

          <div className="hero-visual" id="upload">
            <div className="float-badge float-badge-a" aria-hidden="true">
              <span className="dot dot-mint" /> Summary ready
            </div>
            <div className="float-badge float-badge-b" aria-hidden="true">
              <BookIcon size={14} /> 42 pages indexed
            </div>
            <UploadCard
              onSubmit={onUpload}
              uploading={uploading}
              progress={progress}
              serverError={serverError}
            />
          </div>
        </section>

        <section className="section" id="features">
          <p className="eyebrow">Features</p>
          <h2 className="section-title">Everything you need to understand a document</h2>
          <div className="feature-grid">
            {FEATURES.map(({ icon: Icon, tone, title, body }) => (
              <article key={title} className="feature">
                <span className={`feature-icon tone-${tone}`}><Icon size={22} /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section" id="how">
          <p className="eyebrow">How it works</p>
          <h2 className="section-title">Three steps from PDF to answers</h2>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className="step">
                <span className="step-num">{i + 1}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="footer">
        <span>© {new Date().getFullYear()} DocBot</span>
        <span>RAG · Chroma · Claude</span>
      </footer>
    </div>
  )
}
