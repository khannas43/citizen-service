package org.citizen.platform.tenancy;

import javax.sql.DataSource;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;
import org.springframework.core.env.Environment;

/**
 * Switched on by adding the platform-tenancy dependency. Turn off with citizen.tenancy.enabled=false.
 * citizen.tenancy.trust-state-header=true lets in-cluster callers pass X-State-Code when they have no token.
 */
@AutoConfiguration
@ConditionalOnClass(DataSource.class)
@ConditionalOnProperty(name = "citizen.tenancy.enabled", havingValue = "true", matchIfMissing = true)
public class StateTenancyAutoConfiguration {

    @Bean
    static BeanPostProcessor stateAwareDataSourcePostProcessor() {
        return new BeanPostProcessor() {
            @Override
            public Object postProcessAfterInitialization(Object bean, String beanName) {
                if (bean instanceof DataSource ds && !(bean instanceof StateAwareDataSource)) {
                    return new StateAwareDataSource(ds);
                }
                return bean;
            }
        };
    }

    @Bean
    @ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
    FilterRegistrationBean<StateFilter> stateFilterRegistration(Environment env) {
        boolean trustHeader = env.getProperty("citizen.tenancy.trust-state-header", Boolean.class, false);
        FilterRegistrationBean<StateFilter> reg = new FilterRegistrationBean<>(new StateFilter(trustHeader));
        reg.setOrder(Ordered.HIGHEST_PRECEDENCE + 20);
        reg.addUrlPatterns("/*");
        return reg;
    }
}
