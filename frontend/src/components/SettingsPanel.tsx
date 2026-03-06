import { useState, useEffect, useCallback } from 'react'
import type { SettingsData, SubscriptionStatus } from '../types'
import { fetchSettings, updateSettings, triggerReload, fetchSubscriptionStatus, refreshSubscription } from '../api/client'

const defaultSettings: SettingsData = {
  mode: 'pool',
  log_level: 'info',
  external_ip: '',
  skip_cert_verify: false,

  listener_address: '0.0.0.0',
  listener_port: 2323,
  listener_protocol: 'http',
  listener_username: '',
  listener_password: '',

  multi_port_address: '0.0.0.0',
  multi_port_base_port: 24000,
  multi_port_protocol: 'http',
  multi_port_username: '',
  multi_port_password: '',

  pool_mode: 'sequential',
  pool_failure_threshold: 3,
  pool_blacklist_duration: '24h0m0s',

  management_enabled: true,
  management_listen: '0.0.0.0:9090',
  management_probe_target: '',
  management_password: '',

  sub_refresh_enabled: false,
  sub_refresh_interval: '1h0m0s',
  sub_refresh_timeout: '30s',
  sub_refresh_health_check_timeout: '1m0s',
  sub_refresh_drain_timeout: '30s',
  sub_refresh_min_available_nodes: 1,

  geoip_enabled: false,
  geoip_database_path: './GeoLite2-Country.mmdb',
  geoip_auto_update_enabled: true,
  geoip_auto_update_interval: '24h0m0s',

  subscriptions: [],
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<SettingsData>(defaultSettings)
  const [savedSettings, setSavedSettings] = useState<SettingsData>(defaultSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [needReload, setNeedReload] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  // Subscription status
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null)
  const [subRefreshing, setSubRefreshing] = useState(false)

  // New subscription input
  const [newSubUrl, setNewSubUrl] = useState('')

  const refreshSubStatus = useCallback(async () => {
    try {
      const subData = await fetchSubscriptionStatus()
      if (subData) setSubStatus(subData)
    } catch {
      // ignore errors
    }
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        const [settingsData] = await Promise.all([
          fetchSettings(),
          refreshSubStatus(),
        ])
        const subscriptions = settingsData.subscriptions || []
        const merged = { ...defaultSettings, ...settingsData, subscriptions }
        setSettings(merged)
        setSavedSettings(merged)
        setIsDirty(false)
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载设置失败')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [refreshSubStatus])

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [success])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await updateSettings(settings)
      setSuccess(res.message || '设置已保存')
      setSavedSettings({ ...settings })
      setIsDirty(false)
      if (res.need_reload) setNeedReload(true)
      // Refresh subscription status after saving (config may have changed)
      await refreshSubStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleReload = async () => {
    setReloading(true)
    setError('')
    try {
      const res = await triggerReload()
      setSuccess(res.message || '重载成功')
      setNeedReload(false)
      // Refresh subscription status after reload (subscription manager config updated)
      await refreshSubStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : '重载失败')
    } finally {
      setReloading(false)
    }
  }

  const handleSubRefresh = async () => {
    setSubRefreshing(true)
    setError('')
    try {
      const res = await refreshSubscription()
      setSuccess(`订阅刷新成功，共 ${res.node_count} 个节点`)
      await refreshSubStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : '刷新订阅失败')
    } finally {
      setSubRefreshing(false)
    }
  }

  const addSubscription = () => {
    const url = newSubUrl.trim()
    if (!url) return
    if (settings.subscriptions.includes(url)) {
      setError('该订阅地址已存在')
      return
    }
    setSettings(s => {
      const updated = { ...s, subscriptions: [...s.subscriptions, url] }
      setIsDirty(JSON.stringify(updated) !== JSON.stringify(savedSettings))
      return updated
    })
    setNewSubUrl('')
  }

  const removeSubscription = (index: number) => {
    setSettings(s => {
      const updated = { ...s, subscriptions: s.subscriptions.filter((_, i) => i !== index) }
      setIsDirty(JSON.stringify(updated) !== JSON.stringify(savedSettings))
      return updated
    })
  }

  const updateField = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    setSettings(s => {
      const updated = { ...s, [key]: value }
      setIsDirty(JSON.stringify(updated) !== JSON.stringify(savedSettings))
      return updated
    })
  }

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isDirty])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full animate-in fade-in duration-500">
      {/* Header - sticky */}
      <div className="sticky top-0 z-30 bg-base-100/80 backdrop-blur-xl px-4 lg:px-8 py-4 border-b border-base-300/60 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 max-w-[1200px] mx-auto w-full">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0 border border-primary/20">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              系统设置
            </h2>
            <p className="text-sm text-base-content/50 mt-1.5 ml-[3.25rem]">管理系统所有配置项，修改后需保存生效</p>
          </div>
          <div className="flex gap-2">
            <button
              className={`btn btn-sm lg:btn-md gap-2 shadow-sm ${isDirty ? 'btn-primary' : 'btn-ghost border border-base-300'}`}
              onClick={handleSave}
              disabled={saving || !isDirty}
            >
              {saving ? <span className="loading loading-spinner loading-sm"></span> : isDirty ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  保存设置
                </>
              ) : '✅ 已保存'}
            </button>
            {needReload && (
              <button
                className="btn btn-warning btn-sm lg:btn-md gap-2 shadow-sm animate-pulse"
                onClick={handleReload}
                disabled={reloading}
              >
                {reloading ? <span className="loading loading-spinner loading-sm"></span> : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    重载配置
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 lg:p-8 space-y-6 max-w-[1200px] mx-auto w-full pb-10 flex-1">
        {/* Alerts */}
        {error && (
        <div role="alert" className="alert alert-error alert-soft text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div role="alert" className="alert alert-success alert-soft text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>{success}</span>
        </div>
      )}
      {needReload && (
        <div role="alert" className="alert alert-warning alert-soft text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <span>配置已保存。</span>
            <span className="font-medium">WebUI 密码、探测目标、外部 IP、SSL 验证</span>
            <span>已立即生效；其他配置（运行模式、监听端口、代理池等）需要点击「重载配置」才能生效。</span>
          </div>
        </div>
      )}

      {/* Settings Cards Grid */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* ===== 全局设置 ===== */}
        <div className="rounded-2xl border border-base-300/50 bg-base-100 p-6 lg:p-8 space-y-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3 mb-2 border-b border-base-200 pb-4">
            <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center text-info shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-lg text-base-content">全局设置</h3>
              <p className="text-xs text-base-content/50 font-medium">系统基础运行参数</p>
            </div>
          </div>

          <fieldset className="fieldset">
            <legend className="fieldset-legend font-semibold text-base-content/80">运行模式</legend>
            <select
              className="select select-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
              value={settings.mode}
              onChange={(e) => updateField('mode', e.target.value)}
            >
              <option value="pool">pool - 单端口代理池</option>
              <option value="multi-port">multi-port - 多端口模式</option>
              <option value="hybrid">hybrid - 混合模式</option>
            </select>
            <p className="label text-base-content/50 mt-1">pool: 共享端口 | multi-port: 独立端口 | hybrid: 两者并存</p>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend font-semibold text-base-content/80">日志级别</legend>
            <select
              className="select select-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
              value={settings.log_level}
              onChange={(e) => updateField('log_level', e.target.value)}
            >
              <option value="debug">debug</option>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend font-semibold text-base-content/80">外部 IP 地址</legend>
            <input
              type="text"
              placeholder="例如: 1.2.3.4"
              className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
              value={settings.external_ip}
              onChange={(e) => updateField('external_ip', e.target.value)}
            />
            <p className="label text-base-content/50 mt-1">用于导出时替换 0.0.0.0</p>
          </fieldset>

          <label className="flex items-center justify-between cursor-pointer gap-4 bg-base-200/30 p-4 rounded-xl border border-base-200 hover:border-base-300 transition-colors">
            <div>
              <span className="font-semibold text-base-content/90 block mb-0.5">跳过 SSL 证书验证</span>
              <p className="text-xs text-base-content/50 m-0">全局跳过上游代理的 SSL 证书验证</p>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-md"
              checked={settings.skip_cert_verify}
              onChange={(e) => updateField('skip_cert_verify', e.target.checked)}
            />
          </label>
        </div>

        {/* ===== 监听配置 (Pool 入口) ===== */}
        <div className="rounded-2xl border border-base-300/50 bg-base-100 p-6 lg:p-8 space-y-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3 mb-2 border-b border-base-200 pb-4">
            <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center text-success shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-lg text-base-content">监听配置 (Pool)</h3>
              <p className="text-xs text-base-content/50 font-medium">代理池入口网络参数</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <fieldset className="fieldset">
              <legend className="fieldset-legend font-semibold text-base-content/80">监听地址</legend>
              <input
                type="text"
                className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
                value={settings.listener_address}
                onChange={(e) => updateField('listener_address', e.target.value)}
              />
            </fieldset>
            <fieldset className="fieldset">
              <legend className="fieldset-legend font-semibold text-base-content/80">监听端口</legend>
              <input
                type="number"
                className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
                value={settings.listener_port}
                onChange={(e) => updateField('listener_port', parseInt(e.target.value) || 0)}
                min={1}
                max={65535}
              />
            </fieldset>
          </div>

          <fieldset className="fieldset">
            <legend className="fieldset-legend font-semibold text-base-content/80">监听协议</legend>
            <select
              className="select select-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
              value={settings.listener_protocol}
              onChange={(e) => updateField('listener_protocol', e.target.value)}
            >
              <option value="http">http</option>
              <option value="socks5">socks5</option>
              <option value="mixed">mixed (HTTP + SOCKS5)</option>
            </select>
            <p className="label text-base-content/50 mt-1">mixed 表示同端口同时支持 HTTP 与 SOCKS5</p>
          </fieldset>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <fieldset className="fieldset">
              <legend className="fieldset-legend font-semibold text-base-content/80">代理用户名</legend>
              <input
                type="text"
                className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
                placeholder="可选，留空表示无验证"
                value={settings.listener_username}
                onChange={(e) => updateField('listener_username', e.target.value)}
              />
            </fieldset>
            <fieldset className="fieldset">
              <legend className="fieldset-legend font-semibold text-base-content/80">代理密码</legend>
              <input
                type="text"
                className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
                placeholder="可选，留空表示无验证"
                value={settings.listener_password}
                onChange={(e) => updateField('listener_password', e.target.value)}
              />
            </fieldset>
          </div>
        </div>

        {/* ===== 多端口配置 ===== */}
        <div className="rounded-2xl border border-base-300/50 bg-base-100 p-6 lg:p-8 space-y-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3 mb-2 border-b border-base-200 pb-4">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-lg text-base-content">多端口配置</h3>
              <p className="text-xs text-base-content/50 font-medium">用于 multi-port 或 hybrid 模式</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <fieldset className="fieldset">
              <legend className="fieldset-legend font-semibold text-base-content/80">监听地址</legend>
              <input
                type="text"
                className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
                value={settings.multi_port_address}
                onChange={(e) => updateField('multi_port_address', e.target.value)}
              />
            </fieldset>
            <fieldset className="fieldset">
              <legend className="fieldset-legend font-semibold text-base-content/80">起始端口</legend>
              <input
                type="number"
                className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
                value={settings.multi_port_base_port}
                onChange={(e) => updateField('multi_port_base_port', parseInt(e.target.value) || 0)}
                min={1}
                max={65535}
              />
            </fieldset>
          </div>

          <fieldset className="fieldset">
            <legend className="fieldset-legend font-semibold text-base-content/80">监听协议</legend>
            <select
              className="select select-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
              value={settings.multi_port_protocol}
              onChange={(e) => updateField('multi_port_protocol', e.target.value)}
            >
              <option value="http">http</option>
              <option value="socks5">socks5</option>
              <option value="mixed">mixed (HTTP + SOCKS5)</option>
            </select>
            <p className="label text-base-content/50 mt-1">应用于 multi-port / hybrid 的每个节点入口</p>
          </fieldset>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <fieldset className="fieldset">
              <legend className="fieldset-legend font-semibold text-base-content/80">默认用户名</legend>
              <input
                type="text"
                className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
                placeholder="可选"
                value={settings.multi_port_username}
                onChange={(e) => updateField('multi_port_username', e.target.value)}
              />
            </fieldset>
            <fieldset className="fieldset">
              <legend className="fieldset-legend font-semibold text-base-content/80">默认密码</legend>
              <input
                type="text"
                className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
                placeholder="可选"
                value={settings.multi_port_password}
                onChange={(e) => updateField('multi_port_password', e.target.value)}
              />
            </fieldset>
          </div>
        </div>

        {/* ===== 代理池配置 ===== */}
        <div className="rounded-2xl border border-base-300/50 bg-base-100 p-6 lg:p-8 space-y-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3 mb-2 border-b border-base-200 pb-4">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-lg text-base-content">代理池调度</h3>
              <p className="text-xs text-base-content/50 font-medium">节点选择与高可用策略</p>
            </div>
          </div>

          <fieldset className="fieldset">
            <legend className="fieldset-legend font-semibold text-base-content/80">调度模式</legend>
            <select
              className="select select-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
              value={settings.pool_mode}
              onChange={(e) => updateField('pool_mode', e.target.value)}
            >
              <option value="sequential">sequential - 顺序轮询</option>
              <option value="random">random - 随机选择</option>
              <option value="balance">balance - 最小连接数负载均衡</option>
            </select>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend font-semibold text-base-content/80">失败阈值</legend>
            <input
              type="number"
              className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
              value={settings.pool_failure_threshold}
              onChange={(e) => updateField('pool_failure_threshold', parseInt(e.target.value) || 1)}
              min={1}
            />
            <p className="label text-base-content/50 mt-1">连续失败多少次后加入黑名单</p>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend font-semibold text-base-content/80">黑名单持续时间</legend>
            <input
              type="text"
              className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
              placeholder="例如: 24h, 1h30m"
              value={settings.pool_blacklist_duration}
              onChange={(e) => updateField('pool_blacklist_duration', e.target.value)}
            />
            <p className="label text-base-content/50 mt-1">Go duration 格式: 24h, 1h30m, 30m 等</p>
          </fieldset>
        </div>

        {/* ===== 管理面板 ===== */}
        <div className="rounded-2xl border border-base-300/50 bg-base-100 p-6 lg:p-8 space-y-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3 mb-2 border-b border-base-200 pb-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-lg text-base-content">管理面板</h3>
              <p className="text-xs text-base-content/50 font-medium">Web 界面及探针设置</p>
            </div>
          </div>

          <label className="flex items-center justify-between cursor-pointer gap-4 bg-base-200/30 p-4 rounded-xl border border-base-200 hover:border-base-300 transition-colors">
            <span className="font-semibold text-base-content/90">启用管理面板</span>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-md"
              checked={settings.management_enabled}
              onChange={(e) => updateField('management_enabled', e.target.checked)}
            />
          </label>

          <fieldset className="fieldset">
            <legend className="fieldset-legend font-semibold text-base-content/80">监听地址</legend>
            <input
              type="text"
              className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
              placeholder="0.0.0.0:9090"
              value={settings.management_listen}
              onChange={(e) => updateField('management_listen', e.target.value)}
            />
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend font-semibold text-base-content/80">探测目标</legend>
            <input
              type="text"
              className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
              placeholder="http://www.google.com"
              value={settings.management_probe_target}
              onChange={(e) => updateField('management_probe_target', e.target.value)}
            />
            <p className="label text-base-content/50 mt-1">健康检查的目标地址</p>
          </fieldset>

          <fieldset className="fieldset">
            <legend className="fieldset-legend font-semibold text-base-content/80">WebUI 密码</legend>
            <input
              type="text"
              className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
              placeholder="为空则无需密码"
              value={settings.management_password}
              onChange={(e) => updateField('management_password', e.target.value)}
            />
            <p className="label text-base-content/50 mt-1">为空则不需要登录密码</p>
          </fieldset>
        </div>

        {/* ===== GeoIP ===== */}
        <div className="rounded-2xl border border-base-300/50 bg-base-100 p-6 lg:p-8 space-y-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3 mb-2 border-b border-base-200 pb-4">
            <div className="w-10 h-10 rounded-xl bg-info/10 flex items-center justify-center text-info shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-lg text-base-content">GeoIP 地域分区</h3>
              <p className="text-xs text-base-content/50 font-medium">节点地域解析与自动更新</p>
            </div>
          </div>

          <label className="flex items-center justify-between cursor-pointer gap-4 bg-base-200/30 p-4 rounded-xl border border-base-200 hover:border-base-300 transition-colors">
            <div>
              <span className="font-semibold text-base-content/90 block mb-0.5">启用 GeoIP</span>
              <p className="text-xs text-base-content/50 m-0">按地域自动分组节点</p>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-md"
              checked={settings.geoip_enabled}
              onChange={(e) => updateField('geoip_enabled', e.target.checked)}
            />
          </label>

          {settings.geoip_enabled && (
            <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2">
              <fieldset className="fieldset">
                <legend className="fieldset-legend font-semibold text-base-content/80">数据库路径</legend>
                <input
                  type="text"
                  className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
                  value={settings.geoip_database_path}
                  onChange={(e) => updateField('geoip_database_path', e.target.value)}
                />
              </fieldset>

              <label className="flex items-center justify-between cursor-pointer gap-4 bg-base-200/30 p-4 rounded-xl border border-base-200 hover:border-base-300 transition-colors">
                <span className="font-semibold text-base-content/90">自动更新数据库</span>
                <input
                  type="checkbox"
                  className="toggle toggle-primary toggle-md"
                  checked={settings.geoip_auto_update_enabled}
                  onChange={(e) => updateField('geoip_auto_update_enabled', e.target.checked)}
                />
              </label>

              {settings.geoip_auto_update_enabled && (
                <fieldset className="fieldset animate-in fade-in slide-in-from-top-2">
                  <legend className="fieldset-legend font-semibold text-base-content/80">更新间隔</legend>
                  <input
                    type="text"
                    className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
                    placeholder="24h"
                    value={settings.geoip_auto_update_interval}
                    onChange={(e) => updateField('geoip_auto_update_interval', e.target.value)}
                  />
                </fieldset>
              )}
            </div>
          )}
        </div>

        {/* ===== 订阅刷新 ===== */}
        <div className="rounded-2xl border border-base-300/50 bg-base-100 p-6 lg:p-8 space-y-5 shadow-sm transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3 mb-2 border-b border-base-200 pb-4">
            <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center text-warning shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-lg text-base-content">订阅自动刷新</h3>
              <p className="text-xs text-base-content/50 font-medium">配置订阅定时更新及健康检查</p>
            </div>
          </div>

          <label className="flex items-center justify-between cursor-pointer gap-4 bg-base-200/30 p-4 rounded-xl border border-base-200 hover:border-base-300 transition-colors">
            <span className="font-semibold text-base-content/90">启用定时刷新</span>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-md"
              checked={settings.sub_refresh_enabled}
              onChange={(e) => updateField('sub_refresh_enabled', e.target.checked)}
            />
          </label>

          {settings.sub_refresh_enabled && (
            <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2">
              <div className="grid grid-cols-2 gap-4">
                <fieldset className="fieldset">
                  <legend className="fieldset-legend font-semibold text-base-content/80">刷新间隔</legend>
                  <input
                    type="text"
                    className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
                    placeholder="1h"
                    value={settings.sub_refresh_interval}
                    onChange={(e) => updateField('sub_refresh_interval', e.target.value)}
                  />
                </fieldset>
                <fieldset className="fieldset">
                  <legend className="fieldset-legend font-semibold text-base-content/80">获取超时</legend>
                  <input
                    type="text"
                    className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
                    placeholder="30s"
                    value={settings.sub_refresh_timeout}
                    onChange={(e) => updateField('sub_refresh_timeout', e.target.value)}
                  />
                </fieldset>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <fieldset className="fieldset">
                  <legend className="fieldset-legend font-semibold text-base-content/80">健康检查超时</legend>
                  <input
                    type="text"
                    className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
                    placeholder="1m"
                    value={settings.sub_refresh_health_check_timeout}
                    onChange={(e) => updateField('sub_refresh_health_check_timeout', e.target.value)}
                  />
                </fieldset>
                <fieldset className="fieldset">
                  <legend className="fieldset-legend font-semibold text-base-content/80">排空超时</legend>
                  <input
                    type="text"
                    className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
                    placeholder="30s"
                    value={settings.sub_refresh_drain_timeout}
                    onChange={(e) => updateField('sub_refresh_drain_timeout', e.target.value)}
                  />
                </fieldset>
              </div>

              <fieldset className="fieldset">
                <legend className="fieldset-legend font-semibold text-base-content/80">最少可用节点数</legend>
                <input
                  type="number"
                  className="input input-md w-full bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
                  value={settings.sub_refresh_min_available_nodes}
                  onChange={(e) => updateField('sub_refresh_min_available_nodes', parseInt(e.target.value) || 1)}
                  min={0}
                />
                <p className="label text-base-content/50 mt-1">低于此值时不切换新节点</p>
              </fieldset>
            </div>
          )}
        </div>

        {/* ===== 订阅管理 (full width) ===== */}
        <div className="rounded-2xl border border-base-300/50 bg-base-100 p-6 lg:p-8 space-y-5 shadow-sm transition-shadow hover:shadow-md lg:col-span-2">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-base-200 pb-4 mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center text-error shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-lg text-base-content">订阅链接管理</h3>
                <p className="text-xs text-base-content/50 font-medium">配置节点获取来源</p>
              </div>
            </div>

            {/* Show refresh button when subscriptions exist (saved or in current settings) */}
            {(subStatus?.has_subscriptions || settings.subscriptions.length > 0) && (
              <div className="flex items-center gap-3 bg-base-200/50 px-3 py-1.5 rounded-lg border border-base-300/50">
                {subStatus && subStatus.node_count != null && subStatus.node_count > 0 && (
                  <span className="text-sm font-medium text-base-content/70">
                    节点: <strong className="text-base-content">{subStatus.node_count}</strong>
                  </span>
                )}
                {subStatus?.enabled && (
                  <span className="badge badge-success badge-sm border-none bg-success/20 text-success font-semibold">自动刷新</span>
                )}
                <div className="w-px h-4 bg-base-300 mx-1"></div>
                <button
                  className="btn btn-sm btn-ghost hover:bg-primary/10 hover:text-primary gap-1.5 px-2"
                  onClick={handleSubRefresh}
                  disabled={subRefreshing || subStatus?.is_refreshing || isDirty}
                  title={isDirty ? '请先保存设置并重载配置' : '立即刷新订阅'}
                >
                  {subRefreshing || subStatus?.is_refreshing ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      立即刷新
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {subStatus?.last_error && (
            <div role="alert" className="alert alert-error alert-soft text-sm py-3 animate-in fade-in">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{subStatus.last_error}</span>
            </div>
          )}

          {/* Add subscription */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-base-content/40">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <input
                type="text"
                className="input input-md w-full pl-10 font-mono text-sm bg-base-200/50 focus:bg-base-100 transition-colors focus:border-primary/50"
                placeholder="https://example.com/subscribe?token=xxx"
                value={newSubUrl}
                onChange={(e) => setNewSubUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addSubscription()}
              />
            </div>
            <button
              className="btn btn-md btn-primary shadow-sm"
              onClick={addSubscription}
              disabled={!newSubUrl.trim()}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              添加
            </button>
          </div>

          {/* Subscription list */}
          {settings.subscriptions.length > 0 ? (
            <div className="space-y-3 mt-4">
              {settings.subscriptions.map((url, index) => (
                <div key={index} className="flex items-center gap-3 p-3 lg:p-4 rounded-xl border border-base-200 bg-base-200/30 hover:bg-base-200/60 transition-colors group">
                  <div className="flex-1 min-w-0">
                    <code className="text-sm font-mono text-base-content/80 break-all">{url}</code>
                  </div>
                  <button
                    className="btn btn-sm btn-square btn-ghost text-base-content/40 hover:text-error hover:bg-error/10 shrink-0 opacity-0 group-hover:opacity-100 transition-all"
                    onClick={() => removeSubscription(index)}
                    title="删除订阅"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-xl border border-dashed border-base-300 bg-base-200/20">
              <div className="w-12 h-12 rounded-full bg-base-200 flex items-center justify-center text-base-content/30 mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <p className="text-base font-medium text-base-content/60">暂无订阅链接</p>
              <p className="text-sm text-base-content/40 mt-1">在上方输入框添加您的节点订阅地址</p>
            </div>
          )}
          
          <p className="text-xs text-base-content/40 text-center mt-4">⚠️ 添加或删除订阅后，需点击顶部「保存设置」并「重载配置」才能生效</p>
        </div>
      </div>

      </div>

    </div>
  )
}