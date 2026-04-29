# FormFilla Browser Extension

⚠️ **FOR TESTING PURPOSES ONLY** ⚠️

A powerful form-filling browser extension designed for developers and testers. Automatically fills forms with realistic **test data only** to speed up development and testing workflows.

**IMPORTANT:** This extension should only be used with test environments and test data. Never use real personal, financial, or sensitive information.

## Features

- **Smart Field Detection**: Automatically detects and fills various form field types including:
  - Personal information (names, email, phone, etc.)
  - Address information (street, city, state, zip, country)
  - Payment information (credit cards, expiry dates, CVV)
  - Company information (name, job title, department)
  - Account information (usernames, passwords, websites)

- **Multiple Interaction Methods**:
  - Form-level fill buttons that appear on detected forms
  - Individual field buttons when focusing on form fields
  - Context menu integration for right-click access
  - Extension popup for profile management

- **Test Data Profiles**:
  - Pre-built test profiles (Developer, International, Edge Cases, QA Tester)
  - Custom user profiles with import/export functionality
  - Random data generation for comprehensive testing

- **Developer-Friendly**:
  - Comprehensive field type detection
  - Visual feedback during form filling
  - Customizable fill speed and settings
  - Built with TypeScript for reliability

## Installation

### From Source (Development)

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the extension:
   ```bash
   npm run build
   ```
4. Load the extension in Chrome:
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" in the top right
   - Click "Load unpacked" and select the `dist` folder

### Testing the Extension

1. Open the included `test-page.html` in your browser
2. Try focusing on form fields to see individual field buttons
3. Look for "Fill Form" buttons on complete forms
4. Right-click on form fields to access context menu options
5. Click the extension icon in the toolbar to access the popup

### FF-08 Dynamic Fixture

To manually verify retry and rescan behavior for delayed or replaced native controls:

1. Run `npm run build`
2. Open `ff08-dynamic-test.html` in a browser
3. Trigger the fixture forms with the extension's in-page `Fill Form` buttons

The dynamic replace fixture swaps an email input after the first input event, and the delayed discovery fixture inserts a phone field after the fill run begins. A correct FF-08 implementation should recover and fill both cases.

### Verifying Profile Migration

To manually verify legacy profile upgrades through the real storage layer:

1. Run `npm run build`
2. Open `dist/migrationFixture.html` in a browser
3. Click "Run migration scenarios"

The fixture seeds mock `chrome.storage` with both legacy array payloads and legacy string payloads, calls the real `StorageService.getProfiles()` migration path, and shows whether storage was rewritten with `schemaVersion`, canonical `values`, and compatibility `data`.

## Usage

### Quick Form Filling

1. **Form-Level Filling**: Click the "🔧 Fill Form" button that appears on forms with multiple fields
2. **Individual Fields**: Focus on any form field to see a fill button appear
3. **Context Menu**: Right-click on any form field to access FormFilla options

### Managing Profiles

1. Click the FormFilla icon in the browser toolbar
2. Create custom profiles with your own test data
3. Import existing profiles or export your profiles to share
4. Set a default profile for quick access

### Available Test Profiles

- **Developer Profile**: Realistic developer-focused test data
- **International Profile**: International addresses and phone numbers
- **Edge Cases Profile**: Data designed to test edge cases and validation
- **QA Tester Profile**: Testing-focused data with various scenarios

## Field Detection

FormFilla intelligently detects form fields based on:

- **Input Names**: Recognizes common field names (firstName, email, etc.)
- **Placeholder Text**: Analyzes placeholder text for context
- **Labels**: Examines associated label text
- **Input Types**: Uses HTML input types (email, tel, password, etc.)
- **Context Analysis**: Smart pattern matching for accurate field classification

## Supported Field Types

### Personal Information

- First/Last Name, Full Name
- Email addresses
- Phone numbers
- Date of birth, Age
- Gender

### Address Information

- Street address, Address lines
- City, State/Province
- ZIP/Postal codes
- Country

### Payment Information

- Credit card numbers (test data only)
- Expiry dates, CVV codes
- Cardholder names

### Company Information

- Company names
- Job titles, Departments
- Work contact information

### Account Information

- Usernames, Passwords
- Website URLs
- Profile descriptions

## Development

### Project Structure

```
src/
├── background/     # Service worker for context menus
├── content/        # Content script for form detection
├── popup/          # Extension popup interface
├── options/        # Options page for settings
├── lib/            # Core libraries
│   ├── field-detector.ts    # Smart field detection
│   ├── dummy-data.ts        # Test data generation
│   ├── profiles.ts          # Profile management
│   ├── storage.ts           # Chrome Storage API
│   └── interaction-manager.ts # UI interaction handling
└── types/          # TypeScript type definitions
```

### Building from Source

```bash
# Install dependencies
npm install

# Development build with watch mode
npm run dev

# Production build
npm run build

# Type checking
npm run type-check
```

### Architecture

- **Manifest V3**: Modern Chrome extension architecture
- **TypeScript**: Full type safety and development experience
- **Vite**: Fast build system with Hot Module Replacement
- **Chrome Storage API**: Persistent profile and settings storage
- **Content Scripts**: Form detection and filling logic
- **Service Worker**: Context menu management and coordination

## Privacy & Security

⚠️ **CRITICAL SECURITY NOTICE** ⚠️

**This extension is for testing environments only. Do not use in production or with real data.**

- **Test Data Only**: All data generated is fictional and for testing purposes only
- **No Real Information**: Never input real personal, financial, or sensitive data
- **Development Use**: Intended for developers, QA testers, and development environments
- **Local Data Only**: All data stored locally in browser storage
- **No Network Requests**: Extension works completely offline
- **No Real Financial Data**: Credit card numbers are test-only formats

### Data Safety Guidelines

1. ✅ **DO**: Use in development and test environments
2. ✅ **DO**: Use with fake/dummy data for testing
3. ✅ **DO**: Use for automated testing and development workflows
4. ❌ **DON'T**: Use in production environments
5. ❌ **DON'T**: Input real personal information
6. ❌ **DON'T**: Use real financial or payment information
7. ❌ **DON'T**: Use on forms with real user data

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make your changes and add tests
4. Build and test the extension
5. Submit a pull request

## License

MIT License - feel free to use this in your development workflow!

## Support

For issues, feature requests, or questions:

1. Check the test page (`test-page.html`) to verify installation
2. Open browser developer tools to check for console errors
3. Ensure the extension has necessary permissions
4. Try reloading the extension if behavior seems inconsistent
