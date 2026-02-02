# 📱 Telegram OAuth Phone Input Analysis

## 📋 Overview

Kode JavaScript ini adalah bagian dari **Telegram OAuth Login Widget** yang menangani input dan format nomor telepon. Kode ini berjalan di halaman OAuth Telegram (`oauth.telegram.org`) ketika user memasukkan nomor telepon untuk login.

---

## 🔍 Key Functions

### **1. Helper Functions**

```javascript
function getEl(id) {
  return document.getElementById(id);
}

function ajax(url, data, callback, fallback) {
  // XMLHttpRequest wrapper untuk API calls
}

function cleanRE(value) {
  // Escape regex special characters
  return value.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
}
```

**Purpose:**
- `getEl`: Helper untuk get DOM element
- `ajax`: Wrapper untuk XMLHttpRequest (untuk API calls ke Telegram)
- `cleanRE`: Escape regex characters untuk search functionality

---

### **2. Main Function: `inputFormatPhoneInit`**

**Purpose:** Initialize phone number input dengan country code selection dan formatting

**Parameters:**
- `init_country`: Initial country code (ISO2, e.g., "US")
- `init_phone_number`: Initial phone number
- `lang`: Language for country list sorting

**Key Features:**

#### **A. Country List Processing**
```javascript
var CountriesList = window.CountriesList || [];
var PrefixCountries = [], PrefixPatterns = [];
```

- Loads country list from `window.CountriesList`
- Processes country codes, prefixes, and phone patterns
- Creates lookup maps for fast country detection

#### **B. Phone Number Formatting**
```javascript
function getPatternByPrefix(value) {
  // Returns phone pattern (e.g., "XXX XXX XXXX") based on country code
}
```

- Detects country code from phone number input
- Applies phone number formatting pattern
- Updates placeholder based on country

#### **C. Country Selection**
```javascript
function onSearchOpen(e) {
  // Opens country selection dropdown
  updateSearchResults(query);
}
```

- Country search functionality
- Keyboard navigation (UP/DOWN arrows, ENTER to select)
- Click outside to close

#### **D. Input Handling**
```javascript
function onInput(e) {
  // Handles phone number input
  // Auto-detects country code
  // Formats phone number
  // Updates placeholder
}
```

**Flow:**
1. User types in phone number
2. System detects country code from prefix
3. Applies formatting pattern
4. Updates placeholder
5. Moves cursor appropriately

---

### **3. Ripple Effects: `initRipple`**

**Purpose:** Adds material design ripple effects to input fields and buttons

**Features:**
- Ripple effect on input focus
- Ripple effect on button click
- Touch support for mobile

---

## 🔄 How It Works in Telegram OAuth Flow

### **Step-by-Step Flow:**

1. **User clicks "Login via Telegram" in FarBump**
   - Privy opens Telegram OAuth page (`oauth.telegram.org`)

2. **Telegram OAuth Page Loads**
   - Loads this JavaScript code
   - Initializes phone input with `inputFormatPhoneInit()`
   - Shows country selection and phone input fields

3. **User Enters Phone Number**
   - Types country code (e.g., +1 for US)
   - System auto-detects country
   - Formats phone number (e.g., (123) 456-7890)
   - Updates placeholder

4. **User Submits**
   - Telegram sends confirmation message to user's phone
   - User receives message in Telegram app
   - User confirms in Telegram

5. **OAuth Callback**
   - Telegram redirects back to Privy
   - Privy handles authentication
   - User logged in

---

## 🎯 Key Elements

### **DOM Elements Required:**

```html
<!-- Country Code Input -->
<input id="login-phone-code" type="text" />

<!-- Phone Number Input -->
<input id="login-phone" type="tel" />

<!-- Placeholder -->
<div id="login-phone-placeholder"></div>

<!-- Country Selection -->
<div id="login-country-wrap">
  <div id="login-country-selected"></div>
  <input id="login-country-search" type="text" />
  <div id="login-country-search-results"></div>
</div>
```

---

## 🔍 Important Details

### **1. Country Code Detection**

```javascript
function getCountryDataByPrefix(value) {
  // Detects country from phone number prefix
  // Returns: {prefix, iso2, lname}
}
```

**Example:**
- Input: `+1234567890`
- Detects: US (country code +1)
- Formats: `(234) 567-890`

### **2. Phone Pattern Formatting**

```javascript
function getPatternByPrefix(value) {
  // Returns pattern like "XXX XXX XXXX" for US
  // Returns pattern like "XX XXX XXXX" for UK
}
```

**Patterns:**
- US: `XXX XXX XXXX` → `(123) 456-7890`
- UK: `XX XXX XXXX` → `12 345 6789`
- Indonesia: `XXX-XXX-XXXX` → `123-456-7890`

### **3. Input Validation**

```javascript
function onInput(e) {
  // Only allows digits (0-9)
  // Removes non-numeric characters
  // Limits to 24 characters max
}
```

---

## 🚨 Common Issues

### **1. Response `false` from Telegram OAuth**

**Possible Causes:**
- Domain not configured in BotFather
- Bot token/handle mismatch in Privy Dashboard
- User hasn't started bot in Telegram
- Phone number format incorrect

**This code runs BEFORE the OAuth request**, so if there's an issue here, it's usually:
- Phone number validation fails
- Country code not recognized
- Input format incorrect

### **2. Phone Number Not Accepted**

**Possible Causes:**
- Invalid country code
- Phone number too short/long
- Format doesn't match country pattern

---

## 🔧 Integration with FarBump

### **Current Implementation:**

**FarBump doesn't need to implement this code!**

**Why:**
- ✅ This code runs on Telegram's OAuth page (`oauth.telegram.org`)
- ✅ Privy handles the OAuth flow automatically
- ✅ FarBump only needs to use `useLoginWithTelegram` hook

**Flow:**
1. User clicks "Login via Telegram" in FarBump
2. Privy opens Telegram OAuth page (this code runs there)
3. User enters phone number (this code handles formatting)
4. Telegram sends confirmation message
5. User confirms
6. Privy handles callback
7. User logged in to FarBump

---

## 📝 Key Takeaways

1. **This is Telegram's code**, not FarBump's
2. **Runs on `oauth.telegram.org`**, not on FarBump domain
3. **Handles phone input formatting** on Telegram's side
4. **FarBump doesn't need to implement this**
5. **Privy handles everything automatically**

---

## 🎯 If You're Debugging Telegram Login Issues

### **Check These:**

1. **Phone Input (Telegram's side):**
   - Is phone number format correct?
   - Is country code recognized?
   - Does placeholder update correctly?

2. **OAuth Request (After phone input):**
   - Does Telegram send confirmation message?
   - Does user receive message?
   - Does user confirm in Telegram?

3. **Privy Integration (FarBump's side):**
   - Is `useLoginWithTelegram` hook working?
   - Are callbacks firing?
   - Is user object updated?

---

## 📚 References

- [Telegram Login Widget](https://core.telegram.org/widgets/login)
- [Telegram OAuth](https://core.telegram.org/api/auth)
- [Privy Telegram Authentication](https://docs.privy.io/authentication/user-authentication/login-methods/telegram)

---

## ✅ Summary

**This JavaScript code:**
- ✅ Runs on Telegram's OAuth page
- ✅ Handles phone number input and formatting
- ✅ Manages country selection
- ✅ Not part of FarBump codebase
- ✅ Privy handles integration automatically

**FarBump implementation:**
- ✅ Uses `useLoginWithTelegram` hook
- ✅ Privy opens Telegram OAuth page
- ✅ Telegram handles phone input (this code)
- ✅ Privy handles callback
- ✅ User logged in

**No changes needed in FarBump!** ✅

