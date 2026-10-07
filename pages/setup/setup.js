const ROLE_KEYS = ['wolf', 'villager', 'seer', 'witch', 'hunter', 'guard']
const ROLE_NAMES = ['狼人', '村民', '预言家', '女巫', '猎人', '守卫']

function defaultCounts(count) {
  const extra = count - 6
  const counts = { wolf: 2, villager: 2, seer: 1, witch: 1, hunter: 0, guard: 0 }
  const additions = ['hunter', 'guard', 'villager', 'villager', 'wolf', 'villager']
  for (let i = 0; i < extra; i += 1) counts[additions[i]] += 1
  return counts
}

function makePlayers(count, names) {
  return Array.from({ length: count }, (_, index) => ({
    seat: index + 1,
    name: names && names[index] ? names[index] : ''
  }))
}

function makeRoles(counts) {
  return ROLE_KEYS.map((key, index) => ({ key, name: ROLE_NAMES[index], count: Number(counts[key]) || 0 }))
}

Page({
  data: {
    playerCount: 6,
    players: makePlayers(6),
    roles: makeRoles(defaultCounts(6)),
    witchSelfSave: false,
    speechSeconds: 60,
    customSeconds: '',
    hostCode: '',
    presets: [30, 60, 90, 120],
    playerCountOptions: [6, 7, 8, 9, 10, 11, 12]
  },

  onLoad() {
    const saved = wx.getStorageSync('lastConfig')
    if (!saved) return
    this.setData({
      playerCount: saved.playerCount,
      players: makePlayers(saved.playerCount, saved.players && saved.players.map((player) => player.name)),
      roles: makeRoles(saved.roleCounts || defaultCounts(saved.playerCount)),
      witchSelfSave: !!saved.witchSelfSave,
      speechSeconds: saved.speechSeconds || 60,
      customSeconds: [30, 60, 90, 120].includes(saved.speechSeconds) ? '' : String(saved.speechSeconds)
    })
  },

  changePlayerCount(event) {
    const count = this.data.playerCountOptions[Number(event.detail.value)]
    if (count < 6 || count > 12) return
    this.setData({
      playerCount: count,
      players: makePlayers(count),
      roles: makeRoles(defaultCounts(count))
    })
  },

  changeName(event) {
    const index = Number(event.currentTarget.dataset.index)
    this.setData({ [`players[${index}].name`]: event.detail.value })
  },

  changeRoleCount(event) {
    const index = Number(event.currentTarget.dataset.index)
    const count = Math.max(0, Math.min(12, Number(event.detail.value) || 0))
    this.setData({ [`roles[${index}].count`]: count })
  },

  toggleSelfSave(event) {
    this.setData({ witchSelfSave: event.detail.value })
  },

  choosePreset(event) {
    const seconds = Number(event.currentTarget.dataset.seconds)
    this.setData({ speechSeconds: seconds, customSeconds: '' })
  },

  customTimeInput(event) {
    const value = event.detail.value
    this.setData({ customSeconds: value })
    const seconds = Number(value)
    if (seconds >= 10 && seconds <= 600) this.setData({ speechSeconds: seconds })
  },

  hostCodeInput(event) {
    this.setData({ hostCode: String(event.detail.value).replace(/\D/g, '').slice(0, 4) })
  },

  startGame() {
    const { playerCount, players, roles, witchSelfSave, speechSeconds, customSeconds, hostCode } = this.data
    const roleCounts = {}
    roles.forEach((role) => { roleCounts[role.key] = Number(role.count) || 0 })
    const total = Object.keys(roleCounts).reduce((sum, key) => sum + roleCounts[key], 0)
    if (total !== playerCount) {
      wx.showToast({ title: `角色总数需为 ${playerCount}`, icon: 'none' })
      return
    }
    if (roleCounts.wolf < 1) {
      wx.showToast({ title: '至少需要一张狼人牌', icon: 'none' })
      return
    }
    if (customSeconds && (Number(customSeconds) < 10 || Number(customSeconds) > 600)) {
      wx.showToast({ title: '自定义时长需为 10–600 秒', icon: 'none' })
      return
    }
    if (!/^\d{4}$/.test(hostCode)) {
      wx.showToast({ title: '请输入 4 位主持人口令', icon: 'none' })
      return
    }
    const config = {
      playerCount,
      players,
      roleCounts,
      witchSelfSave,
      speechSeconds
    }
    wx.setStorageSync('lastConfig', config)
    getApp().globalData.activeGame = null
    getApp().globalData.hostCode = hostCode
    wx.navigateTo({ url: '/pages/game/game' })
  }
})
