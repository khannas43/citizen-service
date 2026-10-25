package org.citizen.formdefinition.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.citizen.formdefinition.domain.FormDefinitionStatus;

/**
 * FB-C5 pure Mockito unit tests for {@link FormDefinitionVersionQueryService}: the {@code
 * limit+1} cursor computation, empty pages, and corrupt-admission translation.
 */
class FormDefinitionVersionQueryServiceTest {

    private final FormDefinitionStore store = mock(FormDefinitionStore.class);
    private final FormDefinitionVersionQueryService service = new FormDefinitionVersionQueryService(store);

    @Test
    void fullPageWithExtraRowComputesNextAfterVersionAndTrimsToLimit() {
        // limit=2 -> fetchLimit=3; store returns 3 rows -> page has 2 items + next cursor.
        List<FormDefinitionVersionItem> fetched =
                List.of(
                        new FormDefinitionVersionItem(1, FormDefinitionStatus.draft),
                        new FormDefinitionVersionItem(2, FormDefinitionStatus.published),
                        new FormDefinitionVersionItem(3, FormDefinitionStatus.published));
        when(store.listVersionItems(eq("svc"), eq(0), eq(3))).thenReturn(fetched);

        FormDefinitionVersionListPage page = service.listVersions("svc", null, "2");

        assertThat(page.serviceId()).isEqualTo("svc");
        assertThat(page.items()).hasSize(2);
        assertThat(page.items().get(0).version()).isEqualTo(1);
        assertThat(page.items().get(1).version()).isEqualTo(2);
        assertThat(page.nextAfterVersion()).isPresent();
        assertThat(page.nextAfterVersion().getAsInt()).isEqualTo(2);
        verify(store).listVersionItems("svc", 0, 3);
    }

    @Test
    void lastPageOmitsNextAfterVersionWhenFetchedNotOverLimit() {
        // limit=5 -> fetchLimit=6; store returns exactly 2 rows -> no next cursor.
        List<FormDefinitionVersionItem> fetched =
                List.of(
                        new FormDefinitionVersionItem(10, FormDefinitionStatus.published),
                        new FormDefinitionVersionItem(11, FormDefinitionStatus.retired));
        when(store.listVersionItems(eq("svc"), eq(9), eq(6))).thenReturn(fetched);

        FormDefinitionVersionListPage page = service.listVersions("svc", "9", "5");

        assertThat(page.items()).hasSize(2);
        assertThat(page.nextAfterVersion()).isEmpty();
    }

    @Test
    void emptyStoreResultProducesEmptyPageWithoutNextCursor() {
        when(store.listVersionItems(eq("empty-svc"), eq(0), eq(51))).thenReturn(List.of());

        FormDefinitionVersionListPage page = service.listVersions("empty-svc", null, null);

        assertThat(page.items()).isEmpty();
        assertThat(page.nextAfterVersion()).isEmpty();
        assertThat(page.serviceId()).isEqualTo("empty-svc");
    }

    @Test
    void defaultLimitRequestsFiftyOnePlusOneWhenOmitted() {
        when(store.listVersionItems(eq("svc"), eq(0), eq(51))).thenReturn(List.of());

        service.listVersions("svc", null, null);

        verify(store).listVersionItems("svc", 0, 51);
    }

    @Test
    void corruptAdmissionFromStoreIsWrappedAsStoredDefinitionCorrupt() {
        when(store.listVersionItems(eq("bad-svc"), eq(0), eq(51)))
                .thenThrow(new FormDefinitionAdmissionException("persisted definition coordinates are invalid"));

        assertThatThrownBy(() -> service.listVersions("bad-svc", null, null))
                .isInstanceOf(StoredDefinitionCorruptException.class);
    }

    @Test
    void invalidPaginationParametersRejectedBeforeReachingStore() {
        assertThatThrownBy(() -> service.listVersions("svc", "01", null))
                .isInstanceOf(InvalidPaginationException.class);
        assertThatThrownBy(() -> service.listVersions("svc", null, "101"))
                .isInstanceOf(InvalidPaginationException.class);
        assertThatThrownBy(() -> service.listVersions("svc", null, "0"))
                .isInstanceOf(InvalidPaginationException.class);

        org.mockito.Mockito.verifyNoInteractions(store);
    }

    @Test
    void invalidServiceIdRejectedBeforeReachingStore() {
        assertThatThrownBy(() -> service.listVersions("  padded  ", null, null))
                .isInstanceOf(FormDefinitionAdmissionException.class);

        org.mockito.Mockito.verifyNoInteractions(store);
    }
}
