const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Asset name is required'],
      trim: true,
    },
    details: {
      type: String,
      trim: true,
      default: '',
    },
    assetPhotoUrl: {
      type: String,
      trim: true,
      default: null,
    },
    billUrl: {
      type: String,
      trim: true,
      default: null,
    },
    price: {
      type: Number,
      default: null,
      min: [0, 'Price cannot be negative'],
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    visibilityScope: {
      type: String,
      enum: ['universal', 'division'],
      default: 'universal',
      index: true,
    },
    division_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Division',
      default: null,
      index: true,
    },
    status: {
      type: String,
      enum: ['available', 'assigned', 'retired'],
      default: 'available',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

assetSchema.index({ name: 1, visibilityScope: 1 });

module.exports = mongoose.models.Asset || mongoose.model('Asset', assetSchema);
