import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react"
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { errorMessage, post } from '../lib/api'
import { useSession } from '../lib/session'
import type { Session } from '../lib/types'
import { Brand } from '../components/Layout'
import { Alert, Button, Field, Loading } from '../components/ui'

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-card">
        <Brand name="REVAH" />
        <p className="auth-tagline">Plataforma business de mensageria</p>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        {children}
        {footer && <div className="auth-foot">{footer}</div>}
      </div>
      <p className="auth-legal muted">REVAH® é um produto WMundi · revah.com.br</p>
    </div>
  )
}

export function Login() {
  const { setSession } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const s = await post<Session>('/auth/login', { email, password })
      setSession(s)
      navigate((location.state as any)?.from || '/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Entrar"
      subtitle="Mensagens, CRM e atendimento automático em um só painel."
    >
      <form onSubmit={submit} className="stack">
        {error && <Alert tone="red">{error}</Alert>}
        <Field label="E-mail">
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Senha">
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button variant="primary" type="submit" loading={loading} className="btn-block">
          Entrar
        </Button>
        <Link to="/esqueci-senha" className="center small">
          Esqueci minha senha
        </Link>
        <Link to="/cadastro" className="btn btn-secondary btn-block">
          Criar conta grátis
        </Link>
      </form>
    </AuthShell>
  )
}

export function Register() {
  const { setSession } = useSession()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', password: '' })
  const [accept, setAccept] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (form.password.length < 8) return setError('A senha precisa ter ao menos 8 caracteres.')
    if (!accept) return setError('Aceite os termos de uso para continuar.')
    setLoading(true)
    setError('')
    try {
      const s = await post<Session>('/auth/register', { ...form, acceptTerms: true })
      setSession(s)
      navigate(s.trialAlreadyUsed ? '/assinatura' : '/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Teste grátis"
      subtitle={
        <>
          <strong>2 campanhas com até 20 contatos cada, sem cartão.</strong> Conecte seus canais, importe contatos e veja o resultado antes de assinar.
        </>
      }
      footer={
        <>
          Já tem conta? <Link to="/login">Entrar</Link>
        </>
      }
    >
      <form onSubmit={submit} className="stack">
        {error && <Alert tone="red">{error}</Alert>}
        <Field label="Seu nome">
          <input required autoComplete="name" value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Empresa">
          <input required value={form.company} onChange={set('company')} />
        </Field>
        <Field label="E-mail">
          <input type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Celular / WhatsApp" hint="Com DDD. Usado para validar o teste grátis.">
          <input type="tel" required autoComplete="tel" placeholder="(44) 99999-9999" value={form.phone} onChange={set('phone')} />
        </Field>
        <Field label="Senha" hint="Mínimo de 8 caracteres.">
          <input type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
          <span>
            Li e aceito os{' '}
            <a href="https://revah.com.br/termos" target="_blank" rel="noreferrer">
              termos de uso
            </a>{' '}
            e a{' '}
            <a href="https://revah.com.br/privacidade" target="_blank" rel="noreferrer">
              política de privacidade
            </a>
            .
          </span>
        </label>
        <Button variant="primary" type="submit" loading={loading} className="btn-block">
          Criar conta de teste
        </Button>
        <p className="small muted center">O teste grátis vale uma vez por empresa, e-mail e telefone.</p>
      </form>
    </AuthShell>
  )
}

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState('')
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const r = await post<{ message: string }>('/auth/forgot-password', { email })
      setDone(r.message)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Esqueci minha senha" subtitle="Enviaremos um link para você criar uma nova senha." footer={<Link to="/login">Voltar para o login</Link>}>
      {done ? (
        <Alert tone="green">{done}</Alert>
      ) : (
        <form onSubmit={submit} className="stack">
          {error && <Alert tone="red">{error}</Alert>}
          <Field label="E-mail">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button variant="primary" type="submit" loading={loading} className="btn-block">
            Enviar link
          </Button>
        </form>
      )}
    </AuthShell>
  )
}

export function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const { setSession } = useSession()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError('A senha precisa ter ao menos 8 caracteres.')
    if (password !== confirm) return setError('As senhas não conferem.')
    setLoading(true)
    setError('')
    try {
      const s = await post<Session>('/auth/reset-password', { token, password })
      setSession(s)
      navigate('/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Nova senha" footer={<Link to="/login">Voltar para o login</Link>}>
      {!token ? (
        <Alert tone="red">
          Link incompleto. <Link to="/esqueci-senha">Peça um novo link</Link>.
        </Alert>
      ) : (
        <form onSubmit={submit} className="stack">
          {error && <Alert tone="red">{error}</Alert>}
          <Field label="Nova senha" hint="Mínimo de 8 caracteres.">
            <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Confirme a nova senha">
            <input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button variant="primary" type="submit" loading={loading} className="btn-block">
            Salvar e entrar
          </Button>
        </form>
      )}
    </AuthShell>
  )
}

// Entrada a partir do DentalPos One (aba Marketing).
export function Sso() {
  const [params] = useSearchParams()
  const { setSession } = useSession()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const token = params.get('token') || ''
    if (!token) {
      setError('Link de acesso sem token.')
      return
    }
    post<Session>('/auth/sso/dentalpos', { token })
      .then((s) => {
        setSession(s)
        const next = params.get('next')
        navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true })
      })
      .catch((e) => setError(errorMessage(e)))
  }, [params, setSession, navigate])

  return (
    <div className="auth">
      <div className="auth-card center">
        {error ? (
          <>
            <h1>Não foi possível entrar</h1>
            <Alert tone="red">{error}</Alert>
            <p className="muted small">Volte ao DentalPos One e abra a aba Marketing novamente.</p>
          </>
        ) : (
          <>
            <CheckCircle2 size={28} className="text-indigo" />
            <Loading label="Abrindo Marketing…" />
          </>
        )}
      </div>
    </div>
  )
}
