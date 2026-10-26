import mongoose from 'mongoose'

// One document per config key (economy, coinPacks, gifts, …).
const configSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true },
    updatedBy: String,
  },
  { timestamps: true, minimize: false },
)

export const ConfigEntry = mongoose.model('ConfigEntry', configSchema)
