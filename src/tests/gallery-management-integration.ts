import { prisma } from '../config/database';
import { GalleryService } from '../services/gallery.service';

export async function runTests() {
  console.log('\n🧪 Starting Phase 5: Website Gallery Management System Integration Tests...');

  let passedCount = 0;
  let failedCount = 0;

  async function testCase(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      console.log(`   ✅ [PASSED] ${name}`);
      passedCount++;
    } catch (err: any) {
      console.error(`   ❌ [FAILED] ${name}`);
      console.error(`      Reason: ${err.message || err}`);
      failedCount++;
    }
  }

  // Helper cleanup
  const cleanupSlugs = ['test-wedding-gallery', 'test-portrait-gallery', 'test-event-gallery'];
  await prisma.galleryCollection.deleteMany({
    where: { slug: { in: cleanupSlugs } },
  });

  let collectionId = '';

  // Test 1: Create Gallery Collection via GalleryService
  await testCase('Create Collection with Zod validation & slugification', async () => {
    const collection = await GalleryService.createCollection({
      title: 'Test Wedding Gallery',
      slug: 'Test-Wedding-Gallery',
      category: 'Weddings',
      description: 'Stunning wedding photography collection.',
      displayOrder: 1,
      seoTitle: 'Best Wedding Photos',
      seoDescription: 'Explore our wedding portfolio.',
    });

    if (!collection.id || collection.slug !== 'test-wedding-gallery' || collection.category !== 'Weddings') {
      throw new Error('Collection creation failed or slug was not properly slugified.');
    }
    collectionId = collection.id;
  });

  // Test 2: Update Collection
  await testCase('Update Collection details', async () => {
    const updated = await GalleryService.updateCollection(collectionId, {
      description: 'Updated wedding collection description.',
      seoTitle: 'Updated SEO Title',
    });

    if (updated.description !== 'Updated wedding collection description.' || updated.seoTitle !== 'Updated SEO Title') {
      throw new Error('Collection update failed.');
    }
  });

  // Test 3: Publish & Unpublish Collection
  await testCase('Publish & Unpublish Collection', async () => {
    const published = await GalleryService.setPublishStatus(collectionId, true);
    if (!published.isPublished) throw new Error('Publish collection failed.');

    const unpublished = await GalleryService.setPublishStatus(collectionId, false);
    if (unpublished.isPublished) throw new Error('Unpublish collection failed.');

    // Publish again for public API test
    await GalleryService.setPublishStatus(collectionId, true);
  });

  // Test 4: Image Metadata Update & Reorder
  await testCase('Create, Update & Reorder Gallery Images', async () => {
    const img1 = await prisma.galleryImage.create({
      data: {
        collectionId,
        imageUrl: 'https://example.com/photo1.jpg',
        displayOrder: 1,
        caption: 'First Photo',
      },
    });

    const img2 = await prisma.galleryImage.create({
      data: {
        collectionId,
        imageUrl: 'https://example.com/photo2.jpg',
        displayOrder: 2,
        caption: 'Second Photo',
      },
    });

    // Reorder images
    await GalleryService.reorderImages([
      { id: img1.id, displayOrder: 2 },
      { id: img2.id, displayOrder: 1 },
    ]);

    const updatedImg1 = await prisma.galleryImage.findUnique({ where: { id: img1.id } });
    if (updatedImg1?.displayOrder !== 2) throw new Error('Image reordering failed.');

    // Delete one image
    await GalleryService.deleteImage(img2.id);
    const count = await prisma.galleryImage.count({ where: { collectionId } });
    if (count !== 1) throw new Error('Image deletion failed.');
  });

  // Test 5: Public API Queries
  await testCase('Public API returns published collections and details by slug', async () => {
    const publicCollections = await GalleryService.getPublicCollections();
    if (!Array.isArray(publicCollections) || publicCollections.length === 0) {
      throw new Error('Public collections list is empty.');
    }

    const detail = await GalleryService.getPublicCollectionBySlug('test-wedding-gallery');
    if (!detail.collection || detail.collection.slug !== 'test-wedding-gallery' || !detail.seo) {
      throw new Error('Public collection details by slug failed.');
    }
  });

  // Test 6: Delete Collection
  await testCase('Delete Collection & Cascade Images', async () => {
    await GalleryService.deleteCollection(collectionId);
    const found = await prisma.galleryCollection.findUnique({ where: { id: collectionId } });
    if (found) throw new Error('Collection was not deleted.');
  });

  console.log(`\n📊 Phase 5 Gallery Management Integration Test Summary: ${passedCount} passed, ${failedCount} failed.`);
  if (failedCount > 0) {
    throw new Error('Some gallery management tests failed.');
  }
}

if (require.main === module) {
  runTests().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
