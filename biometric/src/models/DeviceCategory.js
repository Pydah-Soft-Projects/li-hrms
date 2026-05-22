const mongoose = require('mongoose');

const deviceCategorySchema = new mongoose.Schema({
    categoryId: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    /** When true, new users enrolled on a device in this category are cloned to sibling devices in the category. */
    autoCloneEnabled: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('DeviceCategory', deviceCategorySchema);
