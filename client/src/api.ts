
import axios from 'axios'

const api = axios.create({
  baseURL: 'https://intellmeet-ca8e.onrender.com',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('intellmeetToken')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

export default api
