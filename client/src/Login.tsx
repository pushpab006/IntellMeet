
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Login.css'
import api from './api'



function Login() {
const navigate = useNavigate()
  const [isSignup, setIsSignup] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  

  const testBackend = async () => {
    try {
      const response = await api.get('/api/health')
      alert(response.data.message)
    } catch {
      alert('Could not connect to the backend. Check if the server is running.')
    }
  }

  const handleSubmit = async (
  event: React.FormEvent<HTMLFormElement>
) => {
  event.preventDefault()
  alert('Sign in button is working!')
  setLoading(true)

    try {
      const endpoint = isSignup
        ? '/api/auth/signup'
        : '/api/auth/login'

      const payload = isSignup
        ? { fullName, email, password }
        : { email, password }

      const response = await api.post(endpoint, payload)
      console.log('LOGIN RESPONSE:', response.data)
console.log('LOGIN TOKEN:', response.data.token)

     if (!isSignup && response.data.token) {
  localStorage.setItem('intellmeetToken', response.data.token)

  localStorage.setItem(
    'intellmeetUser',
    JSON.stringify(response.data.user)
  )
}
if (isSignup) {
  alert(response.data.message)
  setIsSignup(false)
  setPassword('')
} else {
  console.log('Logged-in user:', response.data.user)


navigate('/', { replace: true })
}
    } catch (error: any) {
      alert(
        error.response?.data?.message ||
        'Something went wrong. Check your backend connection.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="login-logo">✦ IntellMeet</div>

        <div className="brand-message">
          <p className="eyebrow">MEET SMARTER. WORK BETTER.</p>
          <h1>Your team's ideas deserve to go further.</h1>
          <p>
            Meet, collaborate, and turn conversations into meaningful action with AI.
          </p>
        </div>

        <div className="brand-footer">
          One workspace. Smarter collaboration.
        </div>
      </div>

      <div className="login-form-area">
        <div className="login-form">
          <div className="mobile-logo">✦ IntellMeet</div>

          <p className="form-eyebrow">
            {isSignup ? 'CREATE YOUR ACCOUNT' : 'WELCOME BACK'}
          </p>

          <h2>
            {isSignup ? 'Join IntellMeet' : 'Sign in to your workspace'}
          </h2>

          <p className="form-subtitle">
            {isSignup
              ? 'Create an account to get started.'
              : 'Enter your details to continue.'}
          </p>

          <button type="button" onClick={testBackend}>
            Test Backend Connection
          </button>

          <form onSubmit={handleSubmit}>
            {isSignup && (
              <label>
                Full name
                <input
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                />
              </label>
            )}

            <label>
              Email address
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={8}
                required
              />
            </label>

            {!isSignup && (
              <div className="forgot-password">
                <button
                  type="button"
                  onClick={() =>
                    alert('Password recovery will be added later.')
                  }
                >
                  Forgot password?
                </button>
              </div>
            )}

            <button
              className="login-submit"
              type="submit"
              disabled={loading}
            >
              {loading
                ? 'Please wait...'
                : isSignup
                  ? 'Create account →'
                  : 'Sign in →'}
            </button>
          </form>

          <p className="signup-switch">
            {isSignup
              ? 'Already have an account?'
              : "Don't have an account?"}{' '}
            <button
              type="button"
              onClick={() => setIsSignup(!isSignup)}
            >
              {isSignup ? 'Sign in' : 'Create account'}
            </button>
          </p>

          <p className="login-terms">
            By continuing, you agree to our Terms of Service and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  )
}

export default Login
